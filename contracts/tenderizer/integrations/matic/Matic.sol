// // SPDX-FileCopyrightText: 2020 Tenderize <info@tenderize.me>

// // SPDX-License-Identifier: GPL-3.0

// /* See contracts/COMPILERS.md */
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../../../libs/MathUtils.sol";

import "../../Tenderizer.sol";
import "./IMatic.sol";

import "hardhat/console.sol";

contract Matic is Tenderizer {
    using SafeMath for uint256;

    // Matic exchange rate precision
    uint256 constant EXCHANGE_RATE_PRECISION = 100;

    // Matic stakeManager address
    address maticStakeManager;

    // Matic ValidatorShare
    IMatic matic;

    mapping (address => uint256) pendingWithdrawals;
    uint256 totalPendingWithdrawals;

    constructor(IERC20 _steak, address _matic, address _node) Tenderizer(_steak, _node) {
        maticStakeManager = _matic;
        node = _node;
        matic = IMatic(_node);
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

        // use default validator share contract if _node isn't specified
        IMatic matic_ = matic;
        if (_node != address(0)) {
            matic_ = IMatic(_node);
        }

        // approve tokens
        steak.approve(maticStakeManager, amount);

        // stake tokens
        uint256 fxRate = matic.exchangeRate();
        if (fxRate == 0) fxRate = 1;
        uint256 min = amount.mul(EXCHANGE_RATE_PRECISION).div(fxRate);
        matic_.buyVoucher(amount, min);
    }

    function _unstake(address _account, address _node, uint256 _amount) internal override {
        //  // Check that no withdrawal is pending
        // require(pendingWithdrawals[_account] == 0, "PENDING_WITHDRAWAL");
        // uint256 amount = _amount;

        // // Sanity check. Controller already checks user deposits and withdrawals > 0
        // if (_account != owner()) require(amount > 0, "ZERO_AMOUNT");
        // if (amount == 0) {
        //     amount = IERC20(steak).balanceOf(address(this));
        // }

        // // if no _node is specified, stake towards the default node
        // IMatic node_ = IMatic(_node);
        // if (_node == address(0)) {
        //     node_ = IMatic(node);
        // }

        // currentPrincipal = currentPrincipal.sub(_amount);

      
        // // undelegate shares
        // node_.sellVoucher(0);
    }

    function _withdraw(address _account, uint256 /*_amount*/) internal override {
        // // Check that a withdrawal is pending
        // uint256 amount = graph.withdrawDelegated(node, ZERO_ADDRESS);

        // // Transfer amount from unbondingLock to _account
        // steak.transfer(_account, amount);
    }

    function _claimRewards() internal override {
        // restake to compound rewards
        
        try matic.restake() {

        } catch {

        } 


        // calculate rewards and fees
        uint256 rewards;
        uint256 stake;

        {
            uint256 shares = matic.balanceOf(address(this));
            uint256 fxRate = matic.exchangeRate();
            if (fxRate == 0) fxRate = 1;
            stake = shares.mul(fxRate).div(EXCHANGE_RATE_PRECISION);
            
            uint256 currentPrincipal_ = currentPrincipal;

            if (stake >= currentPrincipal_) {
                rewards = stake.sub(currentPrincipal_);
            }
        }

        // Calculate fee
        uint256 fee = MathUtils.percOf(rewards, protocolFee);
        
        if (fee > 0 ) {
            pendingFees = pendingFees.add(fee);
        }
        
        // update principle and pendignFees
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
        node = _stakingContract;
    }

}