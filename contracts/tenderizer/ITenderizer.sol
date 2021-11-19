// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ITenderizer {
    function deposit(address _from, uint256 _amount) external;

    function stake(address _node, uint256 _amount) external;

    function unstake(address _account, uint256 _amount) external returns (uint256 unstakeLockID);

    function withdraw(address _account, uint256 _unstakeLockID) external;

    function claimRewards() external;

    function collectFees() external returns (uint256);

    function collectLiquidityFees() external returns (uint256);

    function totalStakedTokens() external view returns (uint256);

    function calcDepositOut(uint256 amountIn) external returns (uint256);

    // Governance

    function setController(address _controller) external;

    function setNode(address _node) external;

    function setSteak(IERC20 _steak) external;

    function setProtocolFee(uint256 _protocolFee) external;

    function setLiquidityFee(uint256 _liquidityFee) external;

    function setStakingContract(address _stakingContract) external;

    function pendingLiquidityFees() external view returns (uint256);
}
