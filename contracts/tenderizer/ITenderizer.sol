// // SPDX-FileCopyrightText: 2020 Tenderize <info@tenderize.me>

// // SPDX-License-Identifier: GPL-3.0

// /* See contracts/COMPILERS.md */
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ITenderizer {

    function deposit(address _from, uint256 _amount) external;

    function stake(address _node, uint256 _amount) external;

    function unstake(address _account, uint256 _amount) external;

    function withdraw(address _account, uint256 _amount) external;

    function claimRewards() external;

    function collectFees() external returns (uint256);

    function totalStakedTokens() external view returns (uint256);

    // Governance

    function setController(address _controller) external;

    function setNode(address _node) external;

    function setSteak(IERC20 _steak) external;

    function setProtocolFee(uint256 _protocolFee) external;

    function setStakingContract(address _stakingContract) external;
}