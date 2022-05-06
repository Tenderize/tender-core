// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../../libs/MathUtils.sol";

import "../../Tenderizer.sol";
import "../../WithdrawalPools.sol";
import "./IGraph.sol";

import { ITenderSwapFactory } from "../../../tenderswap/TenderSwapFactory.sol";

contract Graph is Tenderizer {
    using WithdrawalPools for WithdrawalPools.Pool;
    using SafeERC20 for IERC20;

    // Eventws for WithdrawalPool
    event ProcessUnstakes(address indexed from, address indexed node, uint256 amount);
    event ProcessWithdraws(address indexed from, uint256 amount);

    // 100% in parts per million
    uint32 private constant MAX_PPM = 1000000;

    IGraph graph;

    WithdrawalPools.Pool withdrawPool;

    function initialize(
        IERC20 _steak,
        string calldata _symbol,
        IGraph _graph,
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
        graph = _graph;
    }

    function _calcDepositOut(uint256 _amountIn) internal view override returns (uint256) {
        return _amountIn - ((uint256(graph.delegationTaxPercentage()) * _amountIn) / MAX_PPM);
    }

    function _deposit(address _from, uint256 _amount) internal override {
        currentPrincipal += _calcDepositOut(_amount);

        emit Deposit(_from, _amount);
    }

    function _stake(uint256 _amount) internal override {
        // Only stake available tokens that are not pending withdrawal
        uint256 amount = _amount;
        uint256 pendingWithdrawals = withdrawPool.getAmount();

        // This check also validates 'amount - pendingWithdrawals' > 0
        if (amount <= pendingWithdrawals) {
            return;
        }

        amount -= pendingWithdrawals;

        // approve amount to Graph protocol
        steak.safeIncreaseAllowance(address(graph), amount);

        // stake tokens
        uint256 delegatedShares = graph.delegate(node, amount);
        assert(delegatedShares > 0);

        emit Stake(node, amount);
    }

    function _unstake(
        address _account,
        address _node,
        uint256 _amount
    ) internal override returns (uint256 unstakeLockID) {
        uint256 amount = _amount;

        unstakeLockID = withdrawPool.unlock(_account, amount);

        emit Unstake(_account, _node, amount, unstakeLockID);
    }

    function processUnstake() external onlyGov {
        uint256 amount = withdrawPool.processUnlocks();

        address node_ = node;

        // Calculate the amount of shares to undelegate
        IGraph.DelegationPool memory delPool = graph.delegationPools(node_);

        uint256 totalShares = delPool.shares;
        uint256 totalTokens = delPool.tokens;

        uint256 shares = (amount * totalShares) / totalTokens;

        // Shares =  amount * totalShares / totalTokens
        // undelegate shares
        graph.undelegate(node_, shares);

        emit ProcessUnstakes(msg.sender, node_, amount);
    }

    function _withdraw(address _account, uint256 _withdrawalID) internal override {
        uint256 amount = withdrawPool.withdraw(_withdrawalID, _account);

        // Transfer amount from unbondingLock to _account
        try steak.transfer(_account, amount) {} catch {
            // Account for roundoff errors in shares calculations
            uint256 steakBal = steak.balanceOf(address(this));
            if (amount > steakBal) {
                steak.safeTransfer(_account, steakBal);
            }
        }

        emit Withdraw(_account, amount, _withdrawalID);
    }

    function processWithdraw() external onlyGov {
        uint256 balBefore = steak.balanceOf(address(this));

        graph.withdrawDelegated(node, address(0));

        uint256 balAfter = steak.balanceOf(address(this));
        uint256 amount = balAfter - balBefore;

        withdrawPool.processWihdrawal(amount);

        emit ProcessWithdraws(msg.sender, amount);
    }

    function _claimSecondaryRewards() internal override {}

    function _processNewStake() internal override returns (int256 rewards) {
        IGraph.Delegation memory delegation = graph.getDelegation(node, address(this));
        IGraph.DelegationPool memory delPool = graph.delegationPools(node);

        uint256 delShares = delegation.shares;
        uint256 totalShares = delPool.shares;
        uint256 totalTokens = delPool.tokens;

        if (totalShares == 0) return 0;

        uint256 stake = (delShares * totalTokens) / totalShares;

        uint256 currentPrincipal_ = currentPrincipal;

        uint256 currentBal = _calcDepositOut(steak.balanceOf(address(this)) - withdrawPool.amount);

        // calculate what the new currentPrinciple would be excluding 
        // pending unlocks and pending user withdrawals
        stake = stake +
            currentBal -
            withdrawPool.pendingUnlock;
            // already subtracted withdrawalPool.amount from the current balancee

        rewards = int256(stake) - int256(currentPrincipal_); 

        // Difference is negative, slash withdrawalpool
        if (rewards < 0) {
            // calculate amount to subtract relative to current principal
            uint256 unstakePoolTokens = withdrawPool.totalTokens();
            uint256 totalTokens = unstakePoolTokens + currentPrincipal_;
            if (totalTokens > 0) {
                uint256 unstakePoolSlash = (currentPrincipal_ - stake) * unstakePoolTokens / totalTokens;
                withdrawPool.updateTotalTokens(unstakePoolTokens - unstakePoolSlash);
            }
        }

        emit RewardsClaimed(rewards, stake, currentPrincipal_);
    }

    function _setStakingContract(address _stakingContract) internal override {
        emit GovernanceUpdate(
            "STAKING_CONTRACT",
            abi.encode(graph),
            abi.encode(_stakingContract)
        );
        graph = IGraph(_stakingContract);
    }
}
