// // SPDX-FileCopyrightText: 2020 Tenderize <info@tenderize.me>

// // SPDX-License-Identifier: GPL-3.0

// /* See contracts/COMPILERS.md */
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../../libs/MathUtils.sol";

import "../../Tenderizer.sol";
import "./ILivepeer.sol";
import "../../../liquidity/IOneInch.sol";

contract Livepeer is Tenderizer {
    uint256 private constant MAX_ROUND = 2**256 - 1;

    IOneInch private oneInch;

    ILivepeer livepeer;

    uint256 private constant ethFees_threshold = 1**17;

    function initialize(
        IERC20 _steak,
        ILivepeer _livepeer,
        address _node
    ) public {
        Tenderizer._initialize(_steak, _node, msg.sender);
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
            amount = IERC20(steak).balanceOf(address(this));
        }

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

    function _unstake(
        address _account,
        address _node,
        uint256 _amount
    ) internal override returns (uint256 unstakeLockID) {
        uint256 amount = _amount;

        // Sanity check. Controller already checks user deposits and withdrawals > 0
        if (_account != controller) require(amount > 0, "ZERO_AMOUNT");
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
       unstakeLockID = ++lastUnstakeLockID;
       unstakeLocks[unstakeLockID] = UnstakeLock({ amount: amount, account: _account });
       
       emit Unstake(_account, node_, amount, unstakeLockID);
    }

    function _withdraw(
        address _account,
        uint256 _unstakeID
    ) internal override {
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

    function _claimRewards() internal override {
        // Livepeer automatically compounds
        // The rewards is the difference between
        // pending stake and the latest cached stake amount

        // TODO: Oh god this is going to be so costly
        // What if we gulp before this call so we have the updated state in getDelegator ? bond might be more costly
        // Let's just code this with everything we need and benchmark gas

        // Account for LPT rewards
        address del = address(this);
        uint256 stake = livepeer.pendingStake(del, MAX_ROUND);
        uint256 ethFees = livepeer.pendingFees(del, MAX_ROUND);

        int256 rewards = int256(stake) - int256(currentPrincipal);

        // withdraw fees
        if (ethFees >= ethFees_threshold) {
            livepeer.withdrawFees();

            // swap ETH fees for LPT
            if (address(oneInch) != address(0)) {
                uint256 swapAmount = address(this).balance;
                (uint256 returnAmount, uint256[] memory distribution) = oneInch.getExpectedReturn(
                    IERC20(address(0)),
                    steak,
                    swapAmount,
                    1,
                    0
                );
                oneInch.swap(IERC20(address(0)), steak, swapAmount, returnAmount, distribution, 0);
            }
        }

        // Substract protocol fee amount and add it to pendingFees
        uint256 _rewards = uint256(rewards);
        if(rewards > 0) {
            uint256 _pendingFees = MathUtils.percOf(_rewards, protocolFee);
            pendingFees += _pendingFees;
            uint256 _liquidityFees = MathUtils.percOf(_rewards, liquidityFee);
            pendingLiquidityFees += _liquidityFees;
            // Add current pending stake minus fees and set it as current principal
            currentPrincipal += _rewards - _pendingFees - _liquidityFees;
        } else {
            _rewards = 0;
            currentPrincipal -= uint256(-rewards);
        }

        emit RewardsClaimed(_rewards, currentPrincipal);
    }

    function _totalStakedTokens() internal view override returns (uint256) {
        return currentPrincipal;
    }

    function _setStakingContract(address _stakingContract) internal override {
        livepeer = ILivepeer(_stakingContract);

        emit GovernanceUpdate("STAKING_CONTRACT");
    }

    function setOneInchContract(address _oneInch) external onlyController {
        oneInch = IOneInch(_oneInch);
    }
}
