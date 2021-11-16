// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

interface ITotalStakedReader {
    function totalStakedTokens() external view returns (uint256);
}
