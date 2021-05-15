// // SPDX-FileCopyrightText: 2020 Tenderize <info@tenderize.me>

// // SPDX-License-Identifier: GPL-3.0

// /* See contracts/COMPILERS.md */
pragma solidity ^0.8.0;

interface ITenderizer {

    function deposit(address _from, uint256 _amount) external;

    function stake(address _node, uint256 _amount) external;

    function unstake(address _account, uint256 _amount) external;

    function withdraw(address _account, uint256 _amount) external;

    function claimRewards() external;

    function collectFees() external returns (uint256);

    function totalStakedTokens() external view returns (uint256);
}