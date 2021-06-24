// // SPDX-FileCopyrightText: 2020 Tenderize <info@tenderize.me>

// // SPDX-License-Identifier: GPL-3.0

// /* See contracts/COMPILERS.md */
pragma solidity ^0.8.0;

interface ITenderFarm {
    function farm(uint256 _amount) external;

    function farmFor(address _for, uint256 _amount) external;

    function unfarm(uint256 _amount) external;

    function harvest() external;

    function addRewards(uint256 _amount) external;

    function availableRewards(address _for) external view returns (uint256);

    function stakeOf(address _of) external view returns (uint256);

    function totalStake() external view returns (uint256);

    function nextTotalStake() external view returns (uint256);
}
