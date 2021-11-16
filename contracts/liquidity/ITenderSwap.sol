// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;


interface ITenderSwap {
        // withdraw fee update function
    function updateUserWithdrawFee(address recipient, uint256 transferAmount)
        external;
}