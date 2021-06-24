// // SPDX-FileCopyrightText: 2020 Tenderize <info@tenderize.me>

// // SPDX-License-Identifier: GPL-3.0

// /* See contracts/COMPILERS.md */
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Registry is Ownable {
    struct TenderizerConfig {
        string name;
        address steak;
        address tenderizer;
        address tenderToken;
        address esp;
        address bpool;
        address tenderFarm;
    }

    event TenderizerCreated(TenderizerConfig config);

    function addTenderizer(TenderizerConfig calldata config) public onlyOwner {
        emit TenderizerCreated(config);
    }
}
