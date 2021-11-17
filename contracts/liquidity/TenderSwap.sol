// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

import "./LiquidityPoolToken.sol";
import "./SwapUtils.sol";

// TODO: Ownership
// TODO: Pausable if upgradeable ? 
// TODO: flat withdraw LP token fee ?


interface IERC20Decimals is IERC20 {
    function decimals() external view returns (uint8);
}

contract TenderSwap is ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;
    using SwapUtils for SwapUtils.Amplification;
    using SwapUtils for SwapUtils.PooledToken;
    using SwapUtils for SwapUtils.FeeParams;

    // fee calculation
    SwapUtils.FeeParams feeParams;

    SwapUtils.Amplification amplificationParams;

    // Pool Tokens
    mapping (IERC20 => SwapUtils.PooledToken) tokens;
    SwapUtils.PooledToken token0;
    SwapUtils.PooledToken token1;

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
     * @param _token0 Elastic supply tenderToken derivative this pool will accept
     * @param _token1 Standard ERC-20 token for the underlying tenderToken this pool will accept
     * @param lpTokenName the long-form name of the token to be deployed
     * @param lpTokenSymbol the short symbol for the token to be deployed
     * @param _a the amplification coefficient * n * (n - 1). See the
     * StableSwap paper for details
     * @param _fee default swap fee to be initialized with
     * @param _adminFee default adminFee to be initialized with
     * @param lpTokenTargetAddress the address of an existing LPToken contract to use as a target
     */
    function initialize(
        IERC20 _token0,
        IERC20 _token1,
        string memory lpTokenName,
        string memory lpTokenSymbol,
        uint256 _a,
        uint256 _fee,
        uint256 _adminFee,
        address lpTokenTargetAddress
    ) public virtual initializer {
        __ReentrancyGuard_init();

        // Check token addresses are different and not 0
        require(_token0 != _token1);
        require(address(_token0) != address(0));
        require(address(_token1) != address(0));

        // Set precision multipliers
        uint8 _tenderTokenDecimals = IERC20Decimals(address(_token0)).decimals();
        require(_tenderTokenDecimals > 0);
        token0 = SwapUtils.PooledToken({
            token: _token0,
            precisionMultiplier: 10 ** (SwapUtils.POOL_PRECISION_DECIMALS - _tenderTokenDecimals)
        });

        uint8 _tokenDecimals = IERC20Decimals(address(_token1)).decimals();
        require(_tokenDecimals > 0);
        token1 = SwapUtils.PooledToken({
            token: _token1,
            precisionMultiplier: 10 ** (SwapUtils.POOL_PRECISION_DECIMALS - _tokenDecimals)
        });

        // Check _a and Set Amplifaction Parameters
        require(_a < SwapUtils.MAX_A, "_a exceeds maximum");
        amplificationParams.initialA = _a * SwapUtils.A_PRECISION;
        amplificationParams.futureA = _a * SwapUtils.A_PRECISION;

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
        return amplificationParams.getA();
    }

    /**
     * @notice Return A in its raw precision form
     * @dev See the StableSwap paper for details
     * @return A parameter in its raw precision form
     */
    function getAPrecise() external view virtual returns (uint256) {
        return amplificationParams.getAPrecise();
    }

    /**
     * @notice Return current balance of token0 in the pool
     * @return current balance of the pooled token
     */
    function getToken0Balance() external view virtual returns (uint256) {
        return token0.getTokenBalance();
    }

    /**
     * @notice Return current balance of token1 in the pool
     * @return current balance of the pooled token
     */
    function getToken1Balance() external view virtual returns (uint256) {
        return token1.getTokenBalance();
    }

    /*** STATE MODIFYING FUNCTIONS ***/

    /**
     * @notice Swap two tokens using this pool
     * @param _tokenFrom the token the user wants to swap from
     * @param _dx the amount of tokens the user wants to swap from
     * @param _minDy the min amount the user would like to receive, or revert.
     * @param _deadline latest timestamp to accept this transaction
     */
    function swap(
        IERC20 _tokenFrom,
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
        if (_tokenFrom == token0.token) {
            return SwapUtils.swap(token0, token1, _dx, _minDy, amplificationParams, feeParams);
        }
        return SwapUtils.swap(token1, token0, _dx, _minDy, amplificationParams, feeParams);
    }

    /**
     * @notice Calculate amount of tokens you receive on swap
     * @param _tokenFrom the token the user wants to sell
     * @param _dx the amount of tokens the user wants to sell. If the token charges
     * a fee on transfers, use the amount that gets transferred after the fee.
     * @return amount of tokens the user will receive
     */
    function calculateSwap(
        IERC20 _tokenFrom,
        uint256 _dx
    ) external view virtual returns (uint256) {
        if (_tokenFrom == token0.token) {
            return SwapUtils.calculateSwap(token0, token1, _dx, amplificationParams, feeParams);
        }
        return SwapUtils.calculateSwap(token1, token0, _dx, amplificationParams, feeParams);
    }

    /**
     * @notice Add liquidity to the pool with the given amounts of tokens
     * @param _amounts the amounts of each token to add, in their native precision 
     *          according to the cardinality of the pool [token0, token1]
     * @param _minToMint the minimum LP tokens adding this amount of liquidity
     * should mint, otherwise revert. Handy for front-running mitigation
     * @param _deadline latest timestamp to accept this transaction
     * @return amount of LP token user minted and received
     */
    function addLiquidity(
        uint256[2] calldata _amounts,
        uint256 _minToMint,
        uint256 _deadline
    )
        external
        virtual
        nonReentrant
        deadlineCheck(_deadline)
        returns (uint256)
    {   
        SwapUtils.PooledToken[2] memory tokens_ = [token0, token1];
        
        return SwapUtils.addLiquidity(tokens_, _amounts, _minToMint, amplificationParams, feeParams, lpToken);
    }

    /**
     * @notice Burn LP tokens to remove liquidity from the pool.
     * @dev Liquidity can always be removed, even when the pool is paused.
     * @param amount the amount of LP tokens to burn
     * @param minAmounts the minimum amounts of each token in the pool
     *        acceptable for this burn. Useful as a front-running mitigation
     *        according to the cardinality of the pool [token0, token1]
     * @param deadline latest timestamp to accept this transaction
     * @return amounts of tokens user received
     */
    function removeLiquidity(
        uint256 amount,
        uint256[2] calldata minAmounts,
        uint256 deadline
    )
        external
        virtual
        nonReentrant
        deadlineCheck(deadline)
        returns (uint256[2] memory)
    {
        SwapUtils.PooledToken[2] memory tokens_ = [token0, token1];

        return SwapUtils.removeLiquidity(amount, tokens_, minAmounts, lpToken);
    }

    /**
     * @notice Remove liquidity from the pool all in one token.
     * @param _tokenAmount the amount of the token you want to receive
     * @param _tokenReceive the  token you want to receive
     * &param _tokenSwap the token you want to swap for
     * @param _minAmount the minimum amount to withdraw, otherwise revert
     * @param _deadline latest timestamp to accept this transaction
     * @return amount of chosen token user received
     */
    function removeLiquidityOneToken(
        uint256 _tokenAmount,
        IERC20 _tokenReceive,
        uint256 _minAmount,
        uint256 _deadline
    )
        external
        virtual
        nonReentrant
        deadlineCheck(_deadline)
        returns (uint256)
    {
        if (_tokenReceive == token0.token) {
            return SwapUtils.removeLiquidityOneToken(
                _tokenAmount,
                token0,
                token1,
                _minAmount,
                amplificationParams,
                feeParams,
                lpToken
            );
        } else {
            return SwapUtils.removeLiquidityOneToken(
                _tokenAmount,
                token1,
                token0,
                _minAmount,
                amplificationParams,
                feeParams,
                lpToken
            );
        }
    }
    /*** INTERNAL FUNCTIONS ***/

    function _deadlineCheck(uint256 _deadline) internal view {
        require(block.timestamp <= _deadline, "Deadline not met");
    }
}