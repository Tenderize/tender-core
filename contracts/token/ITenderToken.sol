// // SPDX-FileCopyrightText: 2020 Tenderize <info@tenderize.me>

// // SPDX-License-Identifier: GPL-3.0

// /* See contracts/COMPILERS.md */
pragma solidity ^0.8.0;

interface ITenderToken {
    function burn(address _account, uint256 _amount) external returns (bool);
    function mint(address _recipient, uint256 _amount) external returns (bool);
    function setTotalPooledTokens(uint256 _newTotalPooledTokens) external;
    function getTotalPooledTokens() external view returns (uint256);
}