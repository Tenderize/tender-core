// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

pragma solidity 0.8.4;

interface ITenderSwap {

    /*** EVENTS ***/

    // events replicated from SwapUtils to make the ABI easier for dumb
    // clients
    event Swap(
        address indexed buyer,
        IERC20  tokenSold,
        uint256 amountSold,
        uint256 amountReceived
    );
    event AddLiquidity(
        address indexed provider,
        uint256[] tokenAmounts,
        uint256[] fees,
        uint256 invariant,
        uint256 lpTokenSupply
    );
    event RemoveLiquidity(
        address indexed provider,
        uint256[] tokenAmounts,
        uint256 lpTokenSupply
    );
    event RemoveLiquidityOne(
        address indexed provider,
        uint256 lpTokenAmount,
        uint256 lpTokenSupply,
        IERC20 tokenReceived,
        uint256 receivedAmount
    );
    event RemoveLiquidityImbalance(
        address indexed provider,
        uint256[] tokenAmounts,
        uint256[] fees,
        uint256 invariant,
        uint256 lpTokenSupply
    );
    event NewAdminFee(uint256 newAdminFee);
    event NewSwapFee(uint256 newSwapFee);
    event RampA(
        uint256 oldA,
        uint256 newA,
        uint256 initialTime,
        uint256 futureTime
    );
    event StopRampA(uint256 currentA, uint256 time);

    /*** INITIALIZER ****/
    function initialize(
        IERC20 _token0,
        IERC20 _token1,
        string memory lpTokenName,
        string memory lpTokenSymbol,
        uint256 _a,
        uint256 _fee,
        uint256 _adminFee,
        address lpTokenTargetAddress) external;

    /*** VIEW FUNCTIONS ***/
    function getA() external view returns (uint256);
    function getAPrecise() external view returns (uint256);
    function getToken0() external view returns (IERC20);
    function getToken1() external view returns (IERC20);
    function getToken0Balance() external view returns (uint256);
    function getVirtualPrice() external view returns (uint256);

    function calculateSwap(
        IERC20 _tokenFrom,
        uint256 _dx
    ) external view returns (uint256);

    function calculateRemoveLiquidity(uint256 amount)
        external
        view
        returns (uint256[2] memory);

    function calculateRemoveLiquidityOneToken(
        uint256 tokenAmount,
        IERC20 tokenReceive
    ) external view returns (uint256 availableTokenAmount);

    function calculateTokenAmount(
        uint256[] calldata amounts,
        bool deposit
    ) external view returns (uint256);

    
    /*** POOL FUNCTIONALITY ***/

    function swap(
        IERC20 _tokenFrom,
        uint256 _dx,
        uint256 _minDy,
        uint256 _deadline
    )
        external
        returns (uint256);
    
    function addLiquidity(
        uint256[2] calldata _amounts,
        uint256 _minToMint,
        uint256 _deadline
    )
        external
        returns (uint256);

    function removeLiquidity(
        uint256 amount,
        uint256[2] calldata minAmounts,
        uint256 deadline
    )
        external
        returns (uint256[2] memory amountsReceived);

    function removeLiquidityOneToken(
        uint256 _tokenAmount,
        IERC20 _tokenReceive,
        uint256 _minAmount,
        uint256 _deadline
    )
        external
        returns (uint256);

    /*** ADMIN FUNCTIONALITY ***/
    function setAdminFee(uint256 newAdminFee) external;
    function setSwapFee(uint256 newSwapFee) external;
    function rampA(uint256 futureA, uint256 futureTime) external;
    function stopRampA() external;
}