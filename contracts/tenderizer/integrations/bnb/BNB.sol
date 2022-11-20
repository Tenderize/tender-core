// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "./IBNB.sol";

import "../../Tenderizer.sol";

import "../../WithdrawalPools.sol";

import { ITenderSwapFactory } from "../../../tenderswap/TenderSwapFactory.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract BNB is Tenderizer {
    using WithdrawalPools for WithdrawalPools.Pool;
    using SafeERC20 for IERC20;

    IBNB bnb;

    WithdrawalPools.Pool withdrawPool;
    event ProcessUnstakes(address indexed from, address indexed node, uint256 amount);
    event ProcessWithdraws(address indexed from, uint256 amount);

    function initialize(
        IERC20 _steak,
        string calldata _symbol,
        IBNB _bnb,
        address _node,
        uint256 _protocolFee,
        uint256 _liquidityFee,
        ITenderToken _tenderTokenTarget,
        TenderFarmFactory _tenderFarmFactory,
        ITenderSwapFactory _tenderSwapFactory
    ) external {
        Tenderizer._initialize(
            _steak,
            _symbol,
            _node,
            _protocolFee,
            _liquidityFee,
            _tenderTokenTarget,
            _tenderFarmFactory,
            _tenderSwapFactory
        );
        bnb = _bnb;
    }

    // override depositHook to handle native chain currency instead of ERC20 tokens
    // uses msg.value instead of the passed amount
    function _depositHook(address _for, uint256 _amount) internal override {
        require(msg.value > 0, "ZERO_AMOUNT");

        uint256 amountOut = _calcDepositOut(msg.value);

        // mint tenderTokens
        require(tenderToken.mint(_for, amountOut), "TENDER_MINT_FAILED");

        _deposit(_for, msg.value);
    }

    // TODO: require user to submit relayer fee to msg.value
    // and check msg.value - relayerFee > 0 ?
    // -- user paying extra doesn't feel nice
    // TODO: Option 2 would be to deduct it from the deposit
    // -- user receiving less feels not nice and imposes min deposit
    // TODO: Option 3 just don't deduct it here or handle it in deposit
    // Take it from pending funds to be staked and spread the cost over everyone
    // -- feels okay, might need a stake threshold that's a multiple of the fee
    function _calcDepositOut(uint256 _amountIn) internal view override returns (uint256) {
        return _amountIn - bnb.getRelayerFee();
    }

    function _deposit(address _from, uint256 _amount) internal override {
        currentPrincipal += _amount;
        emit Deposit(_from, _amount);
    }

    function _stake(uint256 _amount) internal override {
        uint256 amount = _amount;
        uint256 relayerFee = bnb.getRelayerFee();

        // This check also validates 'amount - pendingWithdrawals - relayerFee' > minDelegation
        // Shares the cost of the relayer fee in BNB among all depositers
        unchecked {
            amount = amount - relayerFee;
        }
        if (amount < type(uint256).max - relayerFee - bnb.getMinDelegation()) return;

        // delegate tokens in BNB staking contract
        // use the full '_amount' for msg.value
        // use the amount - relayerFee as argument for 'bnb.delegate'
        bnb.delegate{ value: _amount }(node, amount);

        emit Stake(node, amount);
    }

    function _unstake(
        address _account,
        address _node,
        uint256 _amount
    ) internal override returns (uint256 withdrawalID) {
        withdrawalID = withdrawPool.unlock(_account, _amount);
        emit Unstake(_account, _node, _amount, withdrawalID);
    }

    // TODO: handle relayer fee
    // Subtract it from amount that is actually undelegated
    // While gov can provide the relayer fee
    // In V2 this would need to be automated
    // and the contract would always need to keep
    // at least the relayer fee on hand
    // the latter would have to be handled in '_claimRewards'
    // so the implementation of this function leaves both options open
    function processUnstake() external onlyGov {
        // prevent more unstakes when one is pending
        require(block.timestamp >= bnb.getPendingUndelegateTime(address(this), node));

        uint256 amount = withdrawPool.processUnlocks();
        // undelegate from bnb staking contract
        uint256 relayerFee = bnb.getRelayerFee();
        bnb.undelegate{ value: relayerFee }(node, amount);
        emit ProcessUnstakes(msg.sender, node, amount);
    }

    function _withdraw(address _account, uint256 _withdrawalID) internal override {
        uint256 amount = withdrawPool.withdraw(_withdrawalID, _account);
        payable(_account).transfer(amount);
        emit Withdraw(_account, amount, _withdrawalID);
    }

    function processWithdraw() external onlyGov {
        uint256 amount = bnb.claimUndelegated();
        withdrawPool.processWihdrawal(amount);
        emit ProcessWithdraws(msg.sender, amount);
    }

    function _claimRewards() internal override {
        // _claimSecondaryRewards(); - skip call to save gas
        int256 rewards = _processNewStake();

        if (rewards > 0) {
            uint256 rewards_ = uint256(rewards);
            uint256 pFees = _calculateFees(rewards_, protocolFee);
            uint256 lFees = _calculateFees(rewards_, liquidityFee);
            currentPrincipal += (rewards_ - pFees - lFees);

            _collectFees(pFees);
            _collectLiquidityFees(lFees);
        } else if (rewards < 0) {
            uint256 rewards_ = uint256(-rewards);
            currentPrincipal -= rewards_;
        }

        _stake(address(this).balance - withdrawPool.getAmount());
    }

    function _claimSecondaryRewards() internal override {}

    function _processNewStake() internal override returns (int256 rewards) {
        bnb.claimReward();
        uint256 stake = bnb.getTotalDelegated(address(this));
        uint256 currentPrincipal_ = currentPrincipal;
        uint256 currentBal = _calcDepositOut(address(this).balance - withdrawPool.amount);

        rewards = int256(stake) - int256(currentPrincipal_);

        // technically rewards can't be negative for BNB
        // but handle case to be sure
        if (rewards < 0) {
            // calculate amount to subtract relative to current principal
            uint256 unstakePoolTokens = withdrawPool.totalTokens();
            uint256 totalTokens = unstakePoolTokens + currentPrincipal_;
            if (totalTokens > 0) {
                uint256 unstakePoolSlash = ((currentPrincipal_ - stake) * unstakePoolTokens) / totalTokens;
                withdrawPool.updateTotalTokens(unstakePoolTokens - unstakePoolSlash);
            }
        }

        emit RewardsClaimed(rewards, stake, currentPrincipal_);
    }

    function _setStakingContract(address _stakingContract) internal override {
        emit GovernanceUpdate("STAKING_CONTRACT", abi.encode(bnb), abi.encode(_stakingContract));
        bnb = IBNB(_stakingContract);
    }
}
