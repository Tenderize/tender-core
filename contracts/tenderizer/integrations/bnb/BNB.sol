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

    function _calcDepositOut(uint256 _amountIn) internal view override returns (uint256) {
        return _amountIn - bnb.getRelayerFee();
    }

    function _deposit(address _from, uint256 _amount) internal override {
        currentPrincipal += _amount;
        emit Deposit(_from, _amount);
    }

    function _stake(uint256 _amount) internal override {
        uint256 amount = _amount;
        uint256 pendingWithdrawals = withdrawPool.getAmount();
        uint256 relayerFee = bnb.getRelayerFee();

        // This check also validates 'amount - pendingWithdrawals' > 0
        // Shares the cost of the relayer fee in BNB among all depositers
        unchecked {
            amount = amount - pendingWithdrawals - relayerFee;
        }
        if (amount < type(uint256).max - pendingWithdrawals - relayerFee) return;

        steak.safeIncreaseAllowance(address(bnb), amount);

        // delegate tokens in BNB staking contract
        bnb.delegate(node, amount);

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

    function processUnstake() external onlyGov {
        // prevent more unstakes when one is pending
        require(block.timestamp >= bnb.getPendingUndelegateTime(address(this), node));

        uint256 amount = withdrawPool.processUnlocks();
        // undelegate from bnb staking contract
        bnb.undelegate(node, amount);
        emit ProcessUnstakes(msg.sender, node, amount);
    }

    function _withdraw(address _account, uint256 _withdrawalID) internal override {
        uint256 amount = withdrawPool.withdraw(_withdrawalID, _account);
        steak.safeTransfer(_account, amount);
        emit Withdraw(_account, amount, _withdrawalID);
    }

    function processWithdraw() external onlyGov {
        uint256 amount = bnb.claimUndelegated();
        withdrawPool.processWihdrawal(amount);
        emit ProcessWithdraws(msg.sender, amount);
    }

    function _claimSecondaryRewards() internal override {}

    function _processNewStake() internal override returns (int256 rewards) {
        bnb.claimReward();
        uint256 stake = bnb.getTotalDelegated(address(this));
        uint256 currentPrincipal_ = currentPrincipal;
        uint256 currentBal = _calcDepositOut(steak.balanceOf(address(this)) - withdrawPool.amount);

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
