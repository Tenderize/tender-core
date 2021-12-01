// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>
// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "./LiquidityPoolToken.sol";
import "./SwapUtils.sol";
import "./ITenderSwap.sol";

// TODO: flat withdraw LP token fee ?


interface IERC20Decimals is IERC20 {
    function decimals() external view returns (uint8);
}

/**
 * @title TenderSwap
 * @dev TenderSwap is a light-weight StableSwap implementation for two assets.
 * See the Curve StableSwap paper for more details (https://curve.fi/files/stableswap-paper.pdf).
 * that trade 1:1 with eachother (e.g. USD stablecoins or tenderToken derivatives vs their underlying assets).
 * It supports Elastic Supply ERC20 tokens, which are tokens of which the balances can change 
 * as the total supply of the token 'rebases'.
 */

contract TenderSwap is OwnableUpgradeable, ReentrancyGuardUpgradeable, ITenderSwap {
    using SwapUtils for SwapUtils.Amplification;
    using SwapUtils for SwapUtils.PooledToken;
    using SwapUtils for SwapUtils.FeeParams;

    // Fee parameters
    SwapUtils.FeeParams public feeParams;

    // Amplification coefficient parameters
    SwapUtils.Amplification public amplificationParams;

    // Pool Tokens
    SwapUtils.PooledToken private token0;
    SwapUtils.PooledToken private token1;

    // Liquidity pool shares
    LiquidityPoolToken public override lpToken;

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
     * @param _token0 First token in the pool
     * @param _token1 Second token in the pool
     * @param lpTokenName the long-form name of the token to be deployed
     * @param lpTokenSymbol the short symbol for the token to be deployed
     * @param _a the amplification coefficient * n * (n - 1). See the
     * StableSwap paper for details
     * @param _fee default swap fee to be initialized with
     * @param _adminFee default adminFee to be initialized with
     * @param lpTokenTargetAddress the address of an existing LiquidityPoolToken contract to use as a target
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
    ) public override initializer returns (bool) {
        __Context_init_unchained();
        __Ownable_init_unchained();
        __ReentrancyGuard_init_unchained();

        // Check token addresses are different and not 0
        require(_token0 != _token1, "DUPLICATE_TOKENS");
        require(address(_token0) != address(0), "TOKEN0_ZEROADDRESS");
        require(address(_token1) != address(0), "TOKEN1_ZEROADDRESS");

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

        return true;
    }

    /*** VIEW FUNCTIONS ***/

    /**
     * @notice Return A, the amplification coefficient * n * (n - 1)
     * @dev See the StableSwap paper for details
     * @return A parameter
     */
    function getA() external view override returns (uint256) {
        return amplificationParams.getA();
    }

    /**
     * @notice Return A in its raw precision form
     * @dev See the StableSwap paper for details
     * @return A parameter in its raw precision form
     */
    function getAPrecise() external view override returns (uint256) {
        return amplificationParams.getAPrecise();
    }

    /**
     * @notice Returns the contract address for token0
     * @dev EVM return type is IERC20
     * @return token0 contract address
     */
    function getToken0() external view override returns (IERC20) {
        return token0.token;
    }

    /**
     * @notice Returns the contract address for token1
     * @dev EVM return type is IERC20
     * @return token1 contract address
     */
    function getToken1() external view override returns (IERC20) {
        return token1.token;
    }

    /**
     * @notice Return current balance of token0 in the pool
     * @return current balance of the pooled token
     */
    function getToken0Balance() external view override returns (uint256) {
        return token0.getTokenBalance();
    }

    /**
     * @notice Return current balance of token1 in the pool
     * @return current balance of the pooled token
     */
    function getToken1Balance() external view override returns (uint256) {
        return token1.getTokenBalance();
    }

    /**
     * @notice Get the override price, to help calculate profit
     * @return the override price, scaled to the POOL_PRECISION_DECIMALS
     */
    function getVirtualPrice() external view override returns (uint256) {
        return SwapUtils.getVirtualPrice(token0, token1, amplificationParams, lpToken);
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
    ) external view override returns (uint256) {
        return _tokenFrom == token0.token ?             
                SwapUtils.calculateSwap(token0, token1, _dx, amplificationParams, feeParams)
            :
                SwapUtils.calculateSwap(token1, token0, _dx, amplificationParams, feeParams)
            ;
    }

    /**
     * @notice A simple method to calculate amount of each underlying
     * tokens that is returned upon burning given amount of LP tokens
     * @param amount the amount of LP tokens that would be burned on withdrawal
     * @return array of token balances that the user will receive
     */
    function calculateRemoveLiquidity(uint256 amount)
        external
        view
        override
        returns (uint256[2] memory)
    {
        SwapUtils.PooledToken[2] memory tokens_ = [token0, token1];
        return SwapUtils.calculateRemoveLiquidity(amount, tokens_, lpToken);
    }

    /**
     * @notice Calculate the amount of underlying token available to withdraw
     * when withdrawing via only single token
     * @param tokenAmount the amount of LP token to burn
     * @param tokenReceive the token to receive
     * @return availableTokenAmount calculated amount of underlying token
     * available to withdraw
     */
    function calculateRemoveLiquidityOneToken(
        uint256 tokenAmount,
        IERC20 tokenReceive
    ) external view override returns (uint256 availableTokenAmount) {
        return tokenReceive == token0.token ? 
                SwapUtils.calculateWithdrawOneToken(
                    tokenAmount,
                    token0,
                    token1, 
                    amplificationParams,
                    feeParams,
                    lpToken
                )
            :
                 SwapUtils.calculateWithdrawOneToken(
                     tokenAmount,
                     token1,
                     token0,
                     amplificationParams,
                     feeParams,
                     lpToken
                )
        ;
    }

    /**
     * @notice A simple method to calculate prices from deposits or
     * withdrawals, excluding fees but including slippage. This is
     * helpful as an input into the various "min" parameters on calls
     * to fight front-running
     *
     * @dev This shouldn't be used outside frontends for user estimates.
     *
     * @param amounts an array of token amounts to deposit or withdrawal,
     * corresponding to pool cardinality of [token0, token1]. The amount should be in each
     * pooled token's native precision. 
     * @param deposit whether this is a deposit or a withdrawal
     * @return token amount the user will receive
     */
    function calculateTokenAmount(
        uint256[] calldata amounts,
        bool deposit
    ) external view override returns (uint256) {
        SwapUtils.PooledToken[2] memory tokens_ = [token0, token1];

        return SwapUtils.calculateTokenAmount(tokens_, amounts, deposit, amplificationParams, lpToken);
    }

    /*** STATE MODIFYING FUNCTIONS ***/

    /**
     * @notice Swap two tokens using this pool
     * @dev revert is token being sold is not in the pool.
     * @param _tokenFrom the token the user wants to sell
     * @param _dx the amount of tokens the user wants to swap from
     * @param _minDy the min amount the user would like to receive, or revert
     * @param _deadline latest timestamp to accept this transaction
     */
    function swap(
        IERC20 _tokenFrom,
        uint256 _dx,
        uint256 _minDy,
        uint256 _deadline
    )
        external
        override
        nonReentrant
        deadlineCheck(_deadline)
        returns (uint256)
    {
        if (_tokenFrom == token0.token) {
            return SwapUtils.swap(token0, token1, _dx, _minDy, amplificationParams, feeParams);
        } else if (_tokenFrom == token1.token) {
            return SwapUtils.swap(token1, token0, _dx, _minDy, amplificationParams, feeParams);
        } else {
            revert("BAD_TOKEN_FROM");
        }
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
        override
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
        override
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
        override
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

    /**
     * @notice Remove liquidity from the pool, weighted differently than the
     * pool's current balances. Withdraw fee that decays linearly
     * over period of 4 weeks since last deposit will apply.
     * @param _amounts how much of each token to withdraw
     * @param _maxBurnAmount the max LP token provider is willing to pay to
     * remove liquidity. Useful as a front-running mitigation.
     * @param _deadline latest timestamp to accept this transaction
     * @return amount of LP tokens burned
     */
    function removeLiquidityImbalance(
        uint256[2] calldata _amounts,
        uint256 _maxBurnAmount,
        uint256 _deadline
    )
        external
        override
        nonReentrant
        deadlineCheck(_deadline)
        returns (uint256)
    {
        SwapUtils.PooledToken[2] memory tokens_ = [token0, token1];

        return SwapUtils.removeLiquidityImbalance(
            tokens_,
            _amounts,
            _maxBurnAmount,
            amplificationParams,
            feeParams,
            lpToken
        );
    }

    /*** ADMIN FUNCTIONS ***/

    /**
     * @notice Update the admin fee. Admin fee takes portion of the swap fee.
     * @param newAdminFee new admin fee to be applied on future transactions
     */
    function setAdminFee(uint256 newAdminFee) external override onlyOwner {
        feeParams.setAdminFee(newAdminFee);
    }

    /**
     * @notice Update the swap fee to be applied on swaps
     * @param newSwapFee new swap fee to be applied on future transactions
     */
    function setSwapFee(uint256 newSwapFee) external override onlyOwner {
        feeParams.setSwapFee(newSwapFee);
    }

    /**
     * @notice Start ramping up or down A parameter towards given futureA and futureTime
     * Checks if the change is too rapid, and commits the new A value only when it falls under
     * the limit range.
     * @param futureA the new A to ramp towards
     * @param futureTime timestamp when the new A should be reached
     */
    function rampA(uint256 futureA, uint256 futureTime) external override onlyOwner {
        amplificationParams.rampA(futureA, futureTime);
    }

    /**
     * @notice Stop ramping A immediately. Reverts if ramp A is already stopped.
     */
    function stopRampA() external override onlyOwner {
        amplificationParams.stopRampA();
    }

    /*** INTERNAL FUNCTIONS ***/

    function _deadlineCheck(uint256 _deadline) internal view {
        require(block.timestamp <= _deadline, "Deadline not met");
    }
}