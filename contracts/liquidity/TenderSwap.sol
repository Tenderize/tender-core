// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

import "./LiquidityPoolToken.sol";
import "../token/ITenderToken.sol";
import "./SwapUtils.sol";

// TODO: Ownership
// TODO: Pausable if upgradeable ? 


interface IERC20Decimals is IERC20 {
    function decimals() external view returns (uint8);
}

contract TenderSwap is ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;
    using SafeERC20 for ITenderToken;
    using SwapUtils for SwapUtils.Amplification;
    using SwapUtils for SwapUtils.PooledToken;
    using SwapUtils for SwapUtils.FeeParams;

    // fee calculation
    SwapUtils.FeeParams feeParams;

    SwapUtils.Amplification amplifactionParams;

    // Pool Tokens
    SwapUtils.PooledToken tenderToken;
    SwapUtils.PooledToken token;

    // Liquidity pool shares
    LiquidityPoolToken lpToken;

    /*** MODIFIERS ***/

    /**
     * @notice Modifier to check deadline against current timestamp
     * @param _deadline latest timestamp to accept this transaction
     */
    modifier deadlineCheck(uint256 _deadline) {
        _deadlineCheck(_deadline);
        _;
    }

    /**
     * @notice Initializes this Swap contract with the given parameters.
     * This will also clone a LPToken contract that represents users'
     * LP positions. The owner of LPToken will be this contract - which means
     * only this contract is allowed to mint/burn tokens.
     *
     * @param _tenderToken Elastic supply tenderToken derivative this pool will accept
     * @param _token Standard ERC-20 token for the underlying tenderToken this pool will accept
     * @param lpTokenName the long-form name of the token to be deployed
     * @param lpTokenSymbol the short symbol for the token to be deployed
     * @param _a the amplification coefficient * n * (n - 1). See the
     * StableSwap paper for details
     * @param _fee default swap fee to be initialized with
     * @param _adminFee default adminFee to be initialized with
     * @param lpTokenTargetAddress the address of an existing LPToken contract to use as a target
     */
    function initialize(
        ITenderToken _tenderToken,
        IERC20 _token,
        string memory lpTokenName,
        string memory lpTokenSymbol,
        uint256 _a,
        uint256 _fee,
        uint256 _adminFee,
        address lpTokenTargetAddress
    ) public virtual initializer {
        __ReentrancyGuard_init();

        // Check token addresses are different and not 0
        require(address(_tenderToken) != address(_token));
        require(address(_tenderToken) != address(0));
        require(address(_token) != address(0));

        // Set precision multipliers
        uint8 _tenderTokenDecimals = _tenderToken.decimals();
        require(_tenderTokenDecimals > 0);
        tenderToken = SwapUtils.PooledToken({
            token: IERC20(address(_tenderToken)),
            precisionMultiplier: 10 ** (SwapUtils.POOL_PRECISION_DECIMALS - _tenderTokenDecimals)
        });

        uint8 _tokenDecimals = IERC20Decimals(address(_token)).decimals();
        require(_tokenDecimals > 0);
        token = SwapUtils.PooledToken({
            token: IERC20(address(_token)),
            precisionMultiplier: 10 ** (SwapUtils.POOL_PRECISION_DECIMALS - _tokenDecimals)
        });

        // Check _a and Set Amplifaction Parameters
        require(_a < SwapUtils.MAX_A, "_a exceeds maximum");
        amplifactionParams.initialA = _a * SwapUtils.A_PRECISION;
        amplifactionParams.futureA = _a * SwapUtils.A_PRECISION;

          // Check _fee, _adminFee and set fee parameters
        require(_fee < SwapUtils.MAX_SWAP_FEE, "_fee exceeds maximum");
        require(
            _adminFee < SwapUtils.MAX_ADMIN_FEE,
            "_adminFee exceeds maximum"
        );
        feeParams = SwapUtils.FeeParams({
            swapFee: _fee,
            adminFee: _adminFee
        });

        // Clone an existing LP token deployment in an immutable way
        // see https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.2.0/contracts/proxy/Clones.sol
        lpToken = LiquidityPoolToken(Clones.clone(lpTokenTargetAddress));
        require(
            lpToken.initialize(lpTokenName, lpTokenSymbol),
            "could not init lpToken clone"
        );
    }

    /*** VIEW FUNCTIONS ***/

    /**
     * @notice Return A, the amplification coefficient * n * (n - 1)
     * @dev See the StableSwap paper for details
     * @return A parameter
     */
    function getA() external view virtual returns (uint256) {
        return amplifactionParams.getA();
    }

    /**
     * @notice Return A in its raw precision form
     * @dev See the StableSwap paper for details
     * @return A parameter in its raw precision form
     */
    function getAPrecise() external view virtual returns (uint256) {
        return amplifactionParams.getAPrecise();
    }

    function getTenderToken() external view virtual returns (ITenderToken) {
        return ITenderToken(address(tenderToken.token));
    }

    /**
     * @notice Return current balance of the pooled tenderToken derivative
     * @return current balance of the pooled TenderToken derivative
     */
    function getTenderTokenBalance() external view virtual returns (uint256) {
        return tenderToken.getTokenBalance();
    }

    function getToken() external view virtual returns (IERC20) {
        return token.token;
    }

    /**
     * @notice Return current balance of the underlying token
     * @return current balance of the underlying pooled token
     */
    function getTokenBalance(IERC20 _token) external view virtual returns (uint256) {
        return token.getTokenBalance();
    }

    /*** STATE MODIFYING FUNCTIONS ***/

    /**
     * @notice Swap two tokens using this pool
     * @param _tokenFrom the token the user wants to swap from
     * @param _tokenTo the token the user wants to swap to
     * @param _dx the amount of tokens the user wants to swap from
     * @param _minDy the min amount the user would like to receive, or revert.
     * @param _deadline latest timestamp to accept this transaction
     */
    function swap(
        IERC20 _tokenFrom,
        IERC20 _tokenTo,
        uint256 _dx,
        uint256 _minDy,
        uint256 _deadline
    )
        external
        virtual
        nonReentrant
        deadlineCheck(_deadline)
        returns (uint256)
    {
        // TODO: emit event
        if (_tokenFrom == tenderToken.token) {
            return SwapUtils.swap(tenderToken, token, _dx, _minDy, amplifactionParams, feeParams);
        }
        return SwapUtils.swap(token, tenderToken, _dx, _minDy, amplifactionParams, feeParams);
    }

    /**
     * @notice Calculate amount of tokens you receive on swap
     * @param _tokenFrom the token the user wants to sell
     * @param _tokenTo the token the user wants to buy
     * @param _dx the amount of tokens the user wants to sell. If the token charges
     * a fee on transfers, use the amount that gets transferred after the fee.
     * @return amount of tokens the user will receive
     */
    function calculateSwap(
        IERC20 _tokenFrom,
        IERC20 _tokenTo,
        uint256 _dx
    ) external view virtual returns (uint256) {
        if (_tokenFrom == tenderToken.token) {
            return SwapUtils.calculateSwap(tenderToken, token, _dx, amplifactionParams, feeParams);
        }
        return SwapUtils.calculateSwap(token, tenderToken, _dx, amplifactionParams, feeParams);
    }

    /*** INTERNAL FUNCTIONS ***/

    function _deadlineCheck(uint256 _deadline) internal view {
        require(block.timestamp <= _deadline, "Deadline not met");
    }
}