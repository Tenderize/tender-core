// // SPDX-FileCopyrightText: 2020 Tenderize <info@tenderize.me>

// // SPDX-License-Identifier: GPL-3.0

// /* See contracts/COMPILERS.md */
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../libs/MathUtils.sol";

import "../Tenderizer.sol";

contract MockTenderizer is Tenderizer {

    uint256 public rewardAmount;

    constructor(IERC20 _steak, address _node, uint256 _rewardAmount) Tenderizer(_steak, _node) {
        rewardAmount = _rewardAmount;
    }

    function setRewardAmount(uint256 _rewardAmount) public onlyOwner {
        rewardAmount = _rewardAmount;
    }

    function _deposit(address /*_from*/, uint256 _amount) internal override {
        currentPrincipal += _amount;
    }

    function _stake(address /*_node*/, uint256 _amount) internal override {
    }

    function _unstake(address /*_account*/, address /*_node*/, uint256 _amount) internal override {
        currentPrincipal -= _amount;
    }

    function _withdraw(address _account, uint256 _amount) internal override {
        // Transfer amount from unbondingLock to _account
        steak.transfer(_account, _amount);
    }

    function _claimRewards() internal override {
        uint256 rewards = rewardAmount;

        // Substract protocol fee amount and add it to pendingFees
        uint256 fee = MathUtils.percOf(rewards, protocolFee);
        pendingFees += fee;

        // Add current pending stake minus fees and set it as current principal
        currentPrincipal = currentPrincipal + rewards - fee;
    }

    function _collectFees() internal override returns (uint256) {
        // set pendingFees to 0
        // Controller will mint tenderToken and distribute it
        uint256 before = pendingFees;
        pendingFees = 0;
        return before;
    }

    function _totalStakedTokens() internal override view returns (uint256) {
        return IERC20(steak).balanceOf(address(this));
    }

    function _setStakingContract(address _stakingContract) internal override {

    }

}
