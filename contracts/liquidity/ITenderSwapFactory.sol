// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "./ITenderSwap.sol";

interface ITenderSwapFactory {

    event NewTenderSwap(address tenderSwap, string lpTokenName, uint256 amplifier, uint256 fee, uint256 adminFee);

    function deploy (
        address tenderToken,
        address steak,
        ITenderSwap.Config calldata _config
    ) external returns (ITenderSwap);
}