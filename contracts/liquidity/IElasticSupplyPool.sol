// // SPDX-FileCopyrightText: 2020 Tenderize <info@tenderize.me>

// // SPDX-License-Identifier: GPL-3.0

// /* See contracts/COMPILERS.md */
pragma solidity 0.8.4;

interface IElasticSupplyPool {
    function resyncWeight(address _token) external;
}
