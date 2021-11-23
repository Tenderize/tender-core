// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Registry is Ownable {
    struct TenderizerConfig {
        string name;
        address controller;
        address steak;
        address tenderizer;
        address tenderToken;
        address tenderSwap;
        address tenderFarm;
    }

    event TenderizerCreated(TenderizerConfig config);

    function addTenderizer(TenderizerConfig calldata config) public onlyOwner {
        emit TenderizerCreated(config);
    }
}
