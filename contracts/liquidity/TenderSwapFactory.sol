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
        string calldata _lpTokenName,
        string calldata _lpTokenSymbol,
        uint256 _amplifier,
        uint256 _fee,
        uint256 _adminFee 
    ) external override returns (ITenderSwap) {
        ITenderSwap tenderSwap = ITenderSwap(Clones.clone(address(tenderSwapTarget)));

        require(
            tenderSwap.initialize(
                IERC20(_tenderToken),
                IERC20(_steak),
                _lpTokenName,
                _lpTokenSymbol,
                _amplifier,
                _fee,
                _adminFee,
                address(lpTokenTarget)
            ),
            "FAIL_INIT_TENDERSWAP"
        );

        tenderSwap.transferOwnership(msg.sender);

        emit NewTenderSwap(address(tenderSwap), _lpTokenName, _amplifier, _fee, _adminFee);

        return tenderSwap;
    }
}