// // SPDX-FileCopyrightText: 2020 Tenderize <info@tenderize.me>

// // SPDX-License-Identifier: GPL-3.0

// /* See contracts/COMPILERS.md */
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "../../Tenderizer.sol";
import "./IGraph.sol";

import "hardhat/console.sol";

contract Graph is Tenderizer {
    using SafeMath for uint256;

    // 100% in parts per million
    uint32 private constant MAX_PPM = 1000000;

    IGraph graph;

    mapping (address => uint256) pendingWithdrawals;
    uint256 totalPendingWithdrawals;

    constructor(IERC20 _steak, IGraph _graph, address _node) Tenderizer(_steak, _node) {
        graph = _graph;
    }

    function _deposit(address /*_from*/, uint256 _amount) internal override {
        currentPrincipal = currentPrincipal.add(_amount);
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
    }

    function _unstake(address _account, address _node, uint256 _amount) internal override {
         // Check that no withdrawal is pending
        require(pendingWithdrawals[_account] == 0, "PENDING_WITHDRAWAL");
        uint256 amount = _amount;

        // Sanity check. Controller already checks user deposits and withdrawals > 0
        if (_account != owner()) require(amount > 0, "ZERO_AMOUNT");
        if (amount == 0) {
            amount = IERC20(steak).balanceOf(address(this));
        }

        // if no _node is specified, stake towards the default node
        address node_ = _node;
        if (node_ == ZERO_ADDRESS) {
            node_ = node;
        }

        currentPrincipal = currentPrincipal.sub(_amount);

        // Calculate the amount of shares to undelegate
        IGraph.Delegation memory delegation = graph.getDelegation(node, address(this));
        IGraph.DelegationPool memory delPool = graph.delegationPools(node);

        uint256 delShares = delegation.shares;
        uint256 totalShares = delPool.shares;
        uint256 totalTokens = delPool.tokens;

        uint256 stake = delShares.mul(totalTokens).div(totalShares);
        uint shares = delShares.mul(amount).div(stake);

        pendingWithdrawals[_account] = amount;

        // undelegate shares
        graph.undelegate(node_, shares);
    }

    function _withdraw(address _account, uint256 /*_amount*/) internal override {
        // Check that a withdrawal is pending
        uint256 amount = graph.withdrawDelegated(node, ZERO_ADDRESS);

        // Transfer amount from unbondingLock to _account
        steak.transfer(_account, amount);
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

        uint256 stake = delShares.mul(totalTokens).div(totalShares);

        uint256 rewards;
        if (stake >= currentPrincipal_) {
            rewards = stake.sub(currentPrincipal_);
        }

        console.log("stake after claiming earnings %s", stake);

        // Substract protocol fee amount and add it to pendingFees
        uint256 fee = rewards.mul(protocolFee).div(PERC_DIVISOR);
        pendingFees = pendingFees.add(fee);

        console.log("fee on the rewards %s", fee);
        // Add current pending stake minus fees and set it as current principal
        currentPrincipal = stake.sub(fee);
    }

    function _collectFees() internal override returns (uint256) {
        // set pendingFees to 0
        // Controller will mint tenderToken and distribute it
        uint256 before = pendingFees;
        pendingFees = 0;
        return before;
    }

    function _totalStakedTokens() internal override view returns (uint256) {
        return currentPrincipal;
    }

    function _setStakingContract(address _stakingContract) internal override {
        graph = IGraph(_stakingContract);
    }

}