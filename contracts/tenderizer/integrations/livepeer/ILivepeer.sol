// // SPDX-FileCopyrightText: 2020 Tenderize <info@tenderize.me>

// // SPDX-License-Identifier: GPL-3.0

// /* See contracts/COMPILERS.md */
pragma solidity ^0.8.0;

interface ILivepeer {
    function bond(uint256 _amount, address _to) external;

    function unbond(uint256 _amount) external;

    function rebond(uint256 _unbondingLockId) external;

    function rebondFromUnbonded(address _to, uint256 _unbondingLockId) external;

    function withdrawStake(uint256 _unbondingLockId) external;

    function withdrawFees() external;

    function claimEarnings(uint256 _endRound) external;

    function pendingFees(address _delegator, uint256 _endRound) external view returns (uint256);

    function pendingStake(address _delegator, uint256 _endRound) external view returns (uint256);

    function getDelegator(address _delegator)
        external
        view
        returns (
            uint256 bondedAmount,
            uint256 fees,
            address delegateAddress,
            uint256 delegatedAmount,
            uint256 startRound,
            uint256 lastClaimRound,
            uint256 nextUnbondingLockId
        );
}
