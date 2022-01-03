// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../../libs/MathUtils.sol";

import "../../Tenderizer.sol";
import "./ILivepeer.sol";

import '../../../interfaces/IWETH.sol';
import '../../../interfaces/ISwapRouter.sol';

import {ITenderSwapFactory} from "../../../tenderswap/TenderSwapFactory.sol";

contract Livepeer is Tenderizer {
    uint256 private constant MAX_ROUND = 2**256 - 1;

    IWETH private WETH;
    ISwapRouterWithWETH public uniswapRouter;
    uint24 private constant UNISWAP_POOL_FEE = 10000;

    ILivepeer livepeer;

    uint256 private constant ethFees_threshold = 1**17;

    function initialize(
        IERC20 _steak,
        string calldata _symbol,
        ILivepeer _livepeer,
        address _node,
        TenderTokenConfig calldata _tenderTokenConfig,
        ITenderSwapFactory _tenderSwapFactory
    ) public {
        Tenderizer._initialize(_steak, _symbol, _node, _tenderTokenConfig, _tenderSwapFactory);
        livepeer = _livepeer;
    }

    function _deposit(address _from, uint256 _amount) internal override {
        currentPrincipal += _amount;

        emit Deposit(_from, _amount);
    }

    function _stake(address _node, uint256 _amount) internal override {
        // if no amount is specified, stake all available tokens
        uint256 amount = _amount;

        if (amount == 0) {
            return;
            // TODO: revert ?
        }

        // if no _node is specified, stake towards the default node
        address node_ = _node;
        if (node_ == address(0)) {
            node_ = node;
        }

        // approve amount to Livepeer protocol
        steak.approve(address(livepeer), amount);

        // stake tokens
        livepeer.bond(amount, node_);

        emit Stake(node_, amount);
    }

    // TODO: is unstaking when front running a negative rebase exploitable ? 
    function _unstake(
        address _account,
        address _node,
        uint256 _amount
    ) internal override returns (uint256 unstakeLockID) {
        uint256 amount = _amount;

        // Sanity check. Controller already checks user deposits and withdrawals > 0
        if (_account != gov) require(amount > 0, "ZERO_AMOUNT");
        if (amount == 0) {
            amount = livepeer.pendingStake(address(this), MAX_ROUND);
            require(amount > 0, "ZERO_STAKE");
        }

        // if no _node is specified, stake towards the default node
        address node_ = _node;
        if (node_ == address(0)) {
            node_ = node;
        }

        currentPrincipal -= amount;

        // Unbond tokens
        livepeer.unbond(amount);

        // Manage Livepeer unbonding locks
        unstakeLockID = nextUnstakeLockID;
        unstakeLocks[unstakeLockID] = UnstakeLock({ amount: amount, account: _account });
        nextUnstakeLockID = unstakeLockID + 1;

        emit Unstake(_account, node_, amount, unstakeLockID);
    }

    function _withdraw(address _account, uint256 _unstakeID) internal override {
        UnstakeLock storage lock = unstakeLocks[_unstakeID];
        address account = lock.account;
        uint256 amount = lock.amount;

        require(account == _account, "ACCOUNT_MISTMATCH");
        // Check that a withdrawal is pending
        require(amount > 0, "ZERO_AMOUNT");

        // Remove it from the locks
        delete unstakeLocks[_unstakeID];

        // Withdraw stake, transfers steak tokens to address(this)
        livepeer.withdrawStake(_unstakeID);

        // Transfer amount from unbondingLock to _account
        steak.transfer(account, amount);

        emit Withdraw(account, amount, _unstakeID);
    }

    /**
     * @notice claims secondary rewards
     * these are rewards that are not from staking
     * but from fees that do not directly accumulate
     * towards stake. These could either be liquid
     * underlying tokens, or other tokens that then
     * need to be swapped using a DEX. 
     * Secondary claimed fees will be immeadiatly
     * added to the balance of this contract
     * @dev this is implementation specific
     */
    function _claimSecondaryRewards() internal {
        uint256 ethFees = livepeer.pendingFees(address(this), MAX_ROUND);
        // First claim any fees that are not underlying tokens
        // withdraw fees
        if (ethFees >= ethFees_threshold) {
            livepeer.withdrawFees();

            // Wrap ETH
            uint256 bal = address(this).balance;
            WETH.deposit{value: bal}();
            WETH.approve(address(uniswapRouter), bal);

            // swap ETH fees for LPT
            if (address(uniswapRouter) != address(0)) {
                ISwapRouter.ExactInputSingleParams memory params =
                ISwapRouter.ExactInputSingleParams({
                    tokenIn: address(WETH),
                    tokenOut: address(steak),
                    fee: UNISWAP_POOL_FEE,
                    recipient: address(this),
                    deadline: block.timestamp,
                    amountIn: bal,
                    amountOutMinimum: 0, // TODO: Set5% max slippage
                    sqrtPriceLimitX96: 0
                });
                try uniswapRouter.exactInputSingle(params) returns (uint256 /*_swappedLPT*/) {
                } catch {}
            }
        }
    }

    function _claimRewards() internal override {

        _claimSecondaryRewards();

        // Account for LPT rewards
        uint256 stake = livepeer.pendingStake(address(this), MAX_ROUND);

        Tenderizer._processNewStake(stake);
    }

    function _setStakingContract(address _stakingContract) internal override {
        livepeer = ILivepeer(_stakingContract);

        emit GovernanceUpdate("STAKING_CONTRACT");
    }

    function setUniswapRouter(address _uniswapRouter) external onlyGov {
        uniswapRouter = ISwapRouterWithWETH(_uniswapRouter);
        WETH = IWETH(uniswapRouter.WETH9());
    }
}