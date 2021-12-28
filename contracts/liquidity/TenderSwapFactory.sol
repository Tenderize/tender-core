// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./ITenderSwapFactory.sol";

contract TenderSwapFactory is ITenderSwapFactory {

    ITenderSwap immutable tenderSwapTarget;
    LiquidityPoolToken immutable lpTokenTarget;

    constructor (ITenderSwap _tenderSwapTarget, LiquidityPoolToken _lpTokenTarget){
        tenderSwapTarget = _tenderSwapTarget;
        lpTokenTarget = _lpTokenTarget;
    }

    function deploy (
        address _tenderToken,
        address _steak,
        ITenderSwap.Config calldata _config
    ) external override returns (ITenderSwap) {
        ITenderSwap tenderSwap = ITenderSwap(Clones.clone(address(tenderSwapTarget)));

        require(
            tenderSwap.initialize(
                IERC20(_tenderToken),
                IERC20(_steak),
                _config.lpTokenName,
                _config.lpTokenSymbol,
                _config.amplifier,
                _config.fee,
                _config.adminFee,
                address(lpTokenTarget)
            ),
            "FAIL_INIT_TENDERSWAP"
        );

        tenderSwap.transferOwnership(msg.sender);

        emit NewTenderSwap(address(tenderSwap), _config.lpTokenName, _config.amplifier, _config.fee, _config.adminFee);

        return tenderSwap;
    }
}