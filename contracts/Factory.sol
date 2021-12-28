// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./liquidity/ITenderSwap.sol";
import "./IFactory.sol";

contract Factory is IFactory {

    address tenderSwapTarget;
    address lpTokenTarget;

    constructor (address _tenderSwapTarget, address _lpTokenTarget){
        // TODO: Setter functions for these?
        tenderSwapTarget = _tenderSwapTarget;
        lpTokenTarget = _lpTokenTarget;
    }

    function deployTenderSwap (
        address tenderToken,
        address steak,
        string calldata lpTokenName,
        string calldata lpTokenSymbol,
        uint256 amplifier,
        uint256 fee,
        uint256 adminFee 
    ) external override returns (address) {
        ITenderSwap tenderSwap = ITenderSwap(Clones.clone(tenderSwapTarget));

        require(
            tenderSwap.initialize(
                IERC20(tenderToken),
                IERC20(steak),
                lpTokenName,
                lpTokenSymbol,
                amplifier,
                fee,
                adminFee,
                lpTokenTarget
            ),
            "FAIL_INIT_TENDERSWAP"
        );

        tenderSwap.transferOwnership(msg.sender);

        emit NewTenderSwap(address(tenderSwap), lpTokenName, amplifier, fee, adminFee);

        return address(tenderSwap);
    }
}