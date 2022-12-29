// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

pragma solidity 0.8.4;

contract WETHMock is ERC20 {
    constructor() ERC20("WrappedETH", "WETH") {}

    function deposit() external payable {}
}
