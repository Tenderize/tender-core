// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

interface IFactory {

    // TODO: Add/Remove fields?
    event NewTenderSwap(address tenderSwap, string lpTokenName, uint256 amplifier, uint256 fee, uint256 adminFee);

    function deployTenderSwap (
        address tenderToken,
        address steak,
        string calldata lpTokenName,
        string calldata lpTokenSymbol,
        uint256 amplifier,
        uint256 fee,
        uint256 adminFee 
    ) external returns (address);
}