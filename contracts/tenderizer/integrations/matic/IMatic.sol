// // SPDX-FileCopyrightText: 2020 Tenderize <info@tenderize.me>

// // SPDX-License-Identifier: GPL-3.0

// /* See contracts/COMPILERS.md */
pragma solidity 0.8.4;

// note this contract interface is only for stakeManager use
interface IMatic {
    function unstakeClaimTokens() external;

    function getLiquidRewards(address user) external view returns (uint256);

    function owner() external view returns (address);

    function restake() external;

    function buyVoucher(uint256 _amount, uint256 _minSharesToMint) external;

    function sellVoucher(uint256 _minClaimAmount) external;

    function exchangeRate() external view returns (uint256);

    struct Delegator {
        uint256 shares;
        uint256 withdrawEpoch;
    }

    function delegators(address) external view returns (Delegator memory);

    function balanceOf(address) external view returns (uint256);
}
