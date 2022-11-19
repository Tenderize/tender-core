// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

interface IBNB {
    function delegate(address validator, uint256 amount) external payable;

    function undelegate(address validator, uint256 amount) external payable;

    function getPendingUndelegateTime(address delegator, address validator) external view returns (uint256);

    function claimUndelegated() external returns (uint256 amount);

    function redelegate(
        address validatorSrc,
        address validatorDst,
        uint256 amount
    ) external payable;

    function claimReward() external returns (uint256 amount);

    function getTotalDelegated(address delegator) external view returns (uint256);

    function getMinDelegation() external view returns (uint256);

    function getRelayerFee() external view returns (uint256);
}
