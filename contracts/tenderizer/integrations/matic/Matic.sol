// // SPDX-FileCopyrightText: 2020 Tenderize <info@tenderize.me>

// // SPDX-License-Identifier: GPL-3.0

// /* See contracts/COMPILERS.md */
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "../../Tenderizer.sol";
import "./IMatic.sol";

import "hardhat/console.sol";

contract Matic is Tenderizer {
    using SafeMath for uint256;

    // Matic exchange rate precision
    uint256 constant EXCHANGE_RATE_PRECISION = 100;

    // IMatic matic;
    // IMaticValidatorShare node;

    mapping (address => uint256) pendingWithdrawals;
    uint256 totalPendingWithdrawals;

    constructor(IERC20 _steak, IMatic _matic, address _node) Tenderizer(_steak, _node) {
        node = _node;
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
        // make this an if/else?
        IMatic node_ = IMatic(_node);
        if (_node == address(0)) {
            node_ = IMatic(node);
        }

        // stake tokens
        node_.buyVoucher(amount, 0);
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
        IMatic node_ = IMatic(_node);
        if (_node == address(0)) {
            node_ = IMatic(node);
        }

        currentPrincipal = currentPrincipal.sub(_amount);

      
        // undelegate shares
        node_.sellVoucher(0);
    }

    function _withdraw(address _account, uint256 /*_amount*/) internal override {
        // // Check that a withdrawal is pending
        // uint256 amount = graph.withdrawDelegated(node, ZERO_ADDRESS);

        // // Transfer amount from unbondingLock to _account
        // steak.transfer(_account, amount);
    }

    function _claimRewards() internal override {
        // restake to compound rewards
        IMatic node_ = IMatic(node);
        node_.restake();

        // calculate rewards and fees
        uint256 newPrinciple = node_.delegators(address(this)).shares.div(node_.exchangeRate()).mul(EXCHANGE_RATE_PRECISION);
        uint256 fee = newPrinciple.sub(currentPrincipal).mul(protocolFee).div(PERC_DIVISOR);
        
        // update principle and pendignFees
        pendingFees = pendingFees.add(fee);
        currentPrincipal = newPrinciple.sub(fee);
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
        node = _stakingContract;
    }

}