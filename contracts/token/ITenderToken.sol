// // SPDX-FileCopyrightText: 2020 Tenderize <info@tenderize.me>

// // SPDX-License-Identifier: GPL-3.0

// /* See contracts/COMPILERS.md */
pragma solidity ^0.8.0;

interface ITenderToken {
    function decimals() external pure returns (uint8);
    function totalSupply() external view returns (uint256);
    function getTotalPooledTokens() external view returns (uint256);
    function getTotalShares() external view returns (uint256);
    function balanceOf(address _account) external view returns (uint256);
    function sharesOf(address _account) external view returns (uint256);
    function allowance(address _owner, address _spender) external view returns (uint256);
    function tokensToShares(uint256 _tokens) external view returns (uint256);
    function sharesToTokens(uint256 _shares) external view returns (uint256);

    function transfer(address _recipient, uint256 _amount) external returns (bool);
    function approve(address _spender, uint256 _amount) external returns (bool);
    function transferFrom(address _sender, address _recipient, uint256 _amount) external returns (bool);
    function increaseAllowance(address _spender, uint256 _addedValue) external returns (bool);
    function decreaseAllowance(address _spender, uint256 _subtractedValue) external returns (bool);
    function mint(address _recipient, uint256 _amount) external returns (bool);
    function burn(address _account, uint256 _amount) external returns (bool);
    function setTotalPooledTokens(uint256 _newTotalPooledTokens) external;
}