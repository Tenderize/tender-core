// // SPDX-FileCopyrightText: 2020 Tenderize <info@tenderize.me>

// // SPDX-License-Identifier: GPL-3.0

// /* See contracts/COMPILERS.md */
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../../libs/MathUtils.sol";

import "../../Tenderizer.sol";
import "./IGraph.sol";

contract Graph is Tenderizer {
    // 100% in parts per million
    uint32 private constant MAX_PPM = 1000000;

    IGraph graph;

    struct UnstakeLock {
        uint256 amount;
        address account;
    }

    mapping (uint256 => UnstakeLock) unstakeLocks;

    uint256 lastUnstakeLockID; // incrementing value upon each unstake
    uint256 lastGovUnstakeLockID; // Set to lastUnstakeLockID when governance unstakes
    uint256 lastGovWithdrawLockID; // Set to lastUnstakeLockID when governance unstakes
    uint256 pendingUnstakes; // Amount to unstake next

    function initialize(
        IERC20 _steak,
        IGraph _graph,
        address _node
    ) public {
        Tenderizer._initialize(_steak, _node, msg.sender);
        graph = _graph;
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
        if (node_ == ZERO_ADDRESS) {
            node_ = node;
        }

        // approve amount to Graph protocol
        steak.approve(address(graph), amount);

        // stake tokens
        graph.delegate(node_, amount);

        emit Stake(node_, amount);
    }

    function _unstake(
        address _account,
        address _node,
        uint256 _amount
    ) internal override {
        // Governance Unstake
        if(_account == controller){
            unstakeByGovernance(_node, _amount);
            return;
        }
        // User Unstake
        unstakeByUser(_account, _node, _amount);
    }

    function unstakeByUser(
        address _account,
        address _node,
        uint256 _amount
    ) internal {
        uint256 amount = _amount;

        // Sanity check. Controller already checks user deposits and withdrawals > 0
        require(amount > 0, "ZERO_AMOUNT");

        // if no _node is specified, stake towards the default node
        address node_ = _node;
        if (node_ == ZERO_ADDRESS) {
            node_ = node;
        }

        // update state
        currentPrincipal -= amount;
        pendingUnstakes += amount;
        lastUnstakeLockID += 1;
        unstakeLocks[lastUnstakeLockID] = UnstakeLock({
            amount: amount,
            account: _account
        });

        emit Unstake(_account, node_, amount, lastUnstakeLockID);
    }

    function unstakeByGovernance(address _node, uint256 _amount) internal {
        require(pendingUnstakes > 0, "NO_TOTAL_PENDING_WITHDRAWAL");

        // if no _node is specified, stake towards the default node
        address node_ = _node;
        if (node_ == ZERO_ADDRESS) {
            node_ = node;
        }

        uint256 amount = _amount == 0 ? pendingUnstakes : _amount;

        // Reset pendingUnstakes
        pendingUnstakes -= amount;

        // Set gov unstake ID
        lastGovUnstakeLockID = lastUnstakeLockID;

        // Calculate the amount of shares to undelegate
        IGraph.Delegation memory delegation = graph.getDelegation(node, address(this));
        IGraph.DelegationPool memory delPool = graph.delegationPools(node);
        uint256 delShares = delegation.shares;
        uint256 totalShares = delPool.shares;
        uint256 totalTokens = delPool.tokens;
        uint256 stake = MathUtils.percOf(delShares, totalTokens, totalShares);
        uint shares = MathUtils.percOf(delShares, amount, stake);

        // undelegate shares
        graph.undelegate(node_, shares);

        emit GovernanceUnstake(node_, shares, lastGovUnstakeLockID);
    }

    function _withdraw(
        address _account,
        uint256 /*_amount*/,
        uint256 unstakeLockID
    ) internal override {
        // Governance Withdraw
        if(_account == controller){
            withdrawByGovernance();
            return;
        }
        // User Withdrawal
        withdrawByUser(_account, unstakeLockID);
    }

    function withdrawByUser(address _account, uint256 unstakeLockID) internal {
        address account = unstakeLocks[unstakeLockID].account;
        uint256 amount = unstakeLocks[unstakeLockID].amount;

        delete unstakeLocks[unstakeLockID];
        
        // Check that a withdrawal is pending and valid
        require(account == _account, "ACCOUNT_MISTMATCH");
        require(amount > 0, "ZERO_AMOUNT");

        // Check that gov withdrawal for that unstake has occured
        require(unstakeLockID <= lastGovWithdrawLockID, "GOV_WITHDRAWAL_PENDING");

        // Transfer amount from unbondingLock to _account
        steak.transfer(_account, amount);

        emit Withdraw(_account, amount);
    }

    function withdrawByGovernance() internal {
        // Set gov withdraw lock ID
        lastGovWithdrawLockID = lastGovUnstakeLockID;

        // Will revert if withdrawal does not exist or pending
        uint256 amount = graph.withdrawDelegated(node, ZERO_ADDRESS);

        emit GovernanceWithdraw(node, amount, lastGovWithdrawLockID);
    }

    function _claimRewards() internal override {
        // GRT automatically compounds
        // The rewards is the difference between
        // pending stake and the latest cached stake amount

        // TODO: Oh god this is going to be so costly
        // What if we gulp before this call so we have the updated state in getDelegator ? bond might be more costly
        // Let's just code this with everything we need and benchmark gas

        // Account for LPT rewards
        address del = address(this);
        uint256 currentPrincipal_ = currentPrincipal;

        IGraph.Delegation memory delegation = graph.getDelegation(node, del);
        IGraph.DelegationPool memory delPool = graph.delegationPools(node);

        uint256 delShares = delegation.shares;
        uint256 totalShares = delPool.shares;
        uint256 totalTokens = delPool.tokens;

        uint256 stake = MathUtils.percOf(delShares, totalTokens, totalShares);

        uint256 rewards;
        if (stake >= currentPrincipal_) {
            rewards = stake - currentPrincipal_;
        }

        // Substract protocol fee amount and add it to pendingFees
        uint256 _pendingFees = pendingFees + MathUtils.percOf(rewards, protocolFee);
        pendingFees = _pendingFees;
        uint256 _liquidityFees = pendingLiquidityFees + MathUtils.percOf(rewards, liquidityFee);
        pendingLiquidityFees = _liquidityFees;
        // Add current pending stake minus fees and set it as current principal
        currentPrincipal = stake - _pendingFees - _liquidityFees;

        emit RewardsClaimed(rewards, currentPrincipal);
    }

    function _totalStakedTokens() internal view override returns (uint256) {
        return currentPrincipal;
    }

    function _setStakingContract(address _stakingContract) internal override {
        graph = IGraph(_stakingContract);

        emit GovernanceUpdate("STAKING_CONTRACT");
    }
}
