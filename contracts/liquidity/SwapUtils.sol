// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../libs/MathUtils.sol";

pragma solidity 0.8.4;

library SwapUtils {
    using MathUtils for uint256;
    using SafeERC20 for IERC20;
    
    // =============================================
    //             SWAP LOGIC
    // =============================================

    // the precision all pools tokens will be converted to
    uint8 public constant POOL_PRECISION_DECIMALS = 18;

    // the denominator used to calculate admin and LP fees. For example, an
    // LP fee might be something like tradeAmount.mul(fee).div(FEE_DENOMINATOR)
    uint256 private constant FEE_DENOMINATOR = 10**10;

    // Max swap fee is 1% or 100bps of each swap
    uint256 public constant MAX_SWAP_FEE = 10**8;

    // Max adminFee is 100% of the swapFee
    // adminFee does not add additional fee on top of swapFee
    // Instead it takes a certain % of the swapFee. Therefore it has no impact on the
    // users but only on the earnings of LPs
    uint256 public constant MAX_ADMIN_FEE = 10**10;

    // Constant value used as max loop limit
    uint256 private constant MAX_LOOP_LIMIT = 256;

    uint256 internal constant NUM_TOKENS = 2;

    struct FeeParams {
        uint256 swapFee;
        uint256 adminFee;
    }

    struct PooledToken {
        IERC20 token;
        uint256 precisionMultiplier;
    }

    /**
     * @notice swap two tokens in the pool
     * @param tokenFrom the token to sell
     * @param tokenTo the token to buy
     * @param dx the number of tokens to sell. If the token charges a fee on transfers,
     * use the amount that gets transferred after the fee.
     * @param amplifactionParams amplification parameters for the pool
     * @param feeParams fee parameters for the pool
     * @param dx the amount of tokens the user wants to sell
     * @param minDy the min amount the user would like to receive, or revert.
     * @return amount of token user received on swap
     */
    function swap(
        PooledToken storage tokenFrom,
        PooledToken storage tokenTo,
        uint256 dx,
        uint256 minDy,
        Amplification storage amplifactionParams,
        FeeParams storage feeParams
    ) external returns (uint256) {
        // transfer tokens
        tokenFrom.token.safeTransferFrom(msg.sender, address(this), dx);

        uint256 dy;
        uint256 dyFee;
        (dy, dyFee) = _calculateSwap(
            tokenFrom,
            tokenTo,
            dx,
            amplifactionParams,
            feeParams
        );
        require(dy >= minDy, "Swap didn't result in min tokens");

        uint256 dyAdminFee = dyFee * feeParams.adminFee / FEE_DENOMINATOR / tokenTo.precisionMultiplier;
        // TODO: Need to handle keeping track of admin fees or transfer them instantly

        tokenTo.token.safeTransfer(msg.sender, dy);

        return dy;
    }

    /**
     * @notice Externally calculates a swap between two tokens.
     * @param tokenFrom the token to sell
     * @param tokenTo the token to buy
     * @param dx the number of tokens to sell. If the token charges a fee on transfers,
     * use the amount that gets transferred after the fee.
     * @param amplifactionParams amplification parameters for the pool
     * @param feeParams fee parameters for the pool
     * @return dy the number of tokens the user will get
     */
    function calculateSwap(
        PooledToken storage tokenFrom,
        PooledToken storage tokenTo,
        uint256 dx,
        Amplification storage amplifactionParams,
        FeeParams storage feeParams
    ) external view returns (uint256 dy) {
        (dy, ) = _calculateSwap(
            tokenFrom,
            tokenTo,
            dx,
            amplifactionParams,
            feeParams
        );
    }

    /**
     * @notice Internally calculates a swap between two tokens.
     *
     * @dev The caller is expected to transfer the actual amounts (dx and dy)
     * using the token contracts.
     *
     * @param tokenFrom the token to sell
     * @param tokenTo the token to buy
     * @param dx the number of tokens to sell. If the token charges a fee on transfers,
     * use the amount that gets transferred after the fee.
     * @param amplifactionParams amplification parameters for the pool
    * @param feeParams fee parameters for the pool
     * @return dy the number of tokens the user will get
     * @return dyFee the associated fee
     */
    function _calculateSwap(
        PooledToken storage tokenFrom,
        PooledToken storage tokenTo,
        uint256 dx,
        Amplification storage amplifactionParams,
        FeeParams storage feeParams
    ) internal view returns (uint256 dy, uint256 dyFee) {
        // tokenFrom balance
        uint256 fromBalance = _getTokenBalance(tokenFrom);
        // precision adjusted balance
        uint256 fromXp = _xp(fromBalance, tokenFrom.precisionMultiplier);

        // tokenTo balance
        uint256 toBalance = _getTokenBalance(tokenTo);
        // precision adjusted balance
        uint256 toXp = _xp(toBalance, tokenTo.precisionMultiplier);
        
        // x is the new total amount of tokenFrom
        uint256 x = _xp(dx, tokenFrom.precisionMultiplier) + fromXp;

        uint256 y = getY(
            _getAPrecise(amplifactionParams),
            fromXp,
            toXp,
            x
        );

        dy = toXp - y - 1;
        dyFee = dy * feeParams.swapFee / FEE_DENOMINATOR;
        dy = (dy - dyFee) / tokenTo.precisionMultiplier;
    }

    /**
     * @notice Calculate the new balances of the tokens given FROM and TO tokens.
     * This function is used as a helper function to calculate how much TO token
     * the user should receive on swap.
     *
     * @param preciseA precise form of amplification coefficient
     * @param fromXp FROM precision-adjusted balance in the pool
     * @param toXp TO precision-adjusted balance in the pool
     * @param x the new total amount of precision-adjusted FROM token
     * @return the amount of TO token that should remain in the pool
     */
    function getY(
        uint256 preciseA,
        uint256 fromXp,
        uint256 toXp,
        uint256 x
    ) internal pure returns (uint256) {
        // d is the invariant of the pool
        uint256 d = getD(fromXp, toXp, preciseA);
        uint256 nA = NUM_TOKENS * preciseA;
        uint256 c = d * d / (x * NUM_TOKENS);
        c = c * d * A_PRECISION / (nA * NUM_TOKENS);

        uint256 b = x + ( d * A_PRECISION / nA);
        uint256 yPrev;
        uint256 y = d;

        // iterative approximation
        for (uint256 i = 0; i < MAX_LOOP_LIMIT; i++) {
            yPrev = y;
            y = ( y * y + c ) / ( y * 2 + b  - d);
            // y = y.mul(y).add(c).div(y.mul(2).add(b).sub(d));
            if (y.within1(yPrev)) {
                return y;
            }
        }
        revert("Approximation did not converge");
    }

    /**
     * @notice Get D, the StableSwap invariant, based on a set of balances and a particular A.
     * @param fromXp a precision-adjusted balance of the token to sell
     * @param toXp a precision-adjusted balance of the token to buy
     * @param a the amplification coefficient * n * (n - 1) in A_PRECISION.
     * See the StableSwap paper for details
     * @return the invariant, at the precision of the pool
     */
    function getD(uint256 fromXp, uint256 toXp, uint256 a)
        internal
        pure
        returns (uint256) {
            uint256 s = fromXp + toXp;
            if (s == 0) return 0;

            uint256 prevD;
            uint256 d = s;
            uint256 nA = a * NUM_TOKENS;

            for (uint256 i = 0; i < MAX_LOOP_LIMIT; i++) {
                uint256 dP = d;

                dP = dP * d / ( fromXp * NUM_TOKENS);
                dP = dP * d / ( toXp * NUM_TOKENS);

                prevD = d;

                uint256 num = nA * s / A_PRECISION + (dP * NUM_TOKENS) * d;
                uint denom = (nA - A_PRECISION) * d / A_PRECISION + (NUM_TOKENS + 1) * dP;
                d = num / denom;
                // d = nA
                //     .mul(s)
                //     .div(A_PRECISION)
                //     .add(dP.mul(NUM_TOKENS))
                //     .mul(d)
                //     .div(
                //         nA
                //             .sub(A_PRECISION)
                //             .mul(d)
                //             .div(A_PRECISION)
                //             .add(NUM_TOKENS.add(1).mul(dP))
                //     );
                if (d.within1(prevD)) {
                    return d;
                }
            }

            // Convergence should occur in 4 loops or less. If this is reached, there may be something wrong
            // with the pool. If this were to occur repeatedly, LPs should withdraw via `removeLiquidity()`
            // function which does not rely on D.
            revert("D does not converge");
        }

    /**
     * @notice Given a a balance and precision multiplier, return the
     * precision-adjusted balance.
     *
     * @param balance a token balance in its native precision
     *
     * @param precisionMultiplier a precision multiplier for the token, When multiplied together they
     * should yield amounts at the pool's precision.
     *
     * @return an amount  "scaled" to the pool's precision
     */
    function _xp(
        uint256  balance,
        uint256 precisionMultiplier
    ) internal pure returns (uint256) {
        return balance * precisionMultiplier;
    }

    // =============================================
    //             AMPLIFICATION LOGIC
    // =============================================

    // Constant values used in ramping A calculations
    uint256 public constant A_PRECISION = 100;
    uint256 public constant MAX_A = 10**6;
    uint256 private constant MAX_A_CHANGE = 2;
    uint256 private constant MIN_RAMP_TIME = 14 days;

    struct Amplification {
        // variables around the ramp management of A,
        // the amplification coefficient * n * (n - 1)
        // see https://www.curve.fi/stableswap-paper.pdf for details
        uint256 initialA;
        uint256 futureA;
        uint256 initialATime;
        uint256 futureATime;
    }

        event RampA(
        uint256 oldA,
        uint256 newA,
        uint256 initialTime,
        uint256 futureTime
    );
    event StopRampA(uint256 currentA, uint256 time);

    /**
     * @notice Return A, the amplification coefficient * n * (n - 1)
     * @dev See the StableSwap paper for details
     * @param self Swap struct to read from
     * @return A parameter
     */
    function getA(Amplification storage self)
        external
        view
        returns (uint256)
    {
        return _getAPrecise(self) / A_PRECISION;
    }

    /**
     * @notice Return A in its raw precision
     * @dev See the StableSwap paper for details
     * @param self Swap struct to read from
     * @return A parameter in its raw precision form
     */
    function getAPrecise(Amplification storage self)
        external
        view
        returns (uint256)
    {
        return _getAPrecise(self);
    }

    /**
     * @notice Return A in its raw precision
     * @dev See the StableSwap paper for details
     * @param self Swap struct to read from
     * @return A parameter in its raw precision form
     */
    function _getAPrecise(Amplification storage self)
        internal
        view
        returns (uint256)
    {
        uint256 t1 = self.futureATime; // time when ramp is finished
        uint256 a1 = self.futureA; // final A value when ramp is finished

        if (block.timestamp < t1) {
            uint256 t0 = self.initialATime; // time when ramp is started
            uint256 a0 = self.initialA; // initial A value when ramp is started
            if (a1 > a0) {
                // a0 + (a1 - a0) * (block.timestamp - t0) / (t1 - t0)
                return a0 + (a1 - a0) * (block.timestamp - t0) / (t1 - t0);
            } else {
                // a0 - (a0 - a1) * (block.timestamp - t0) / (t1 - t0)
                return a0 - (a0 - a1) * (block.timestamp - t0) / (t1 - t0);
            }
        } else {
            return a1;
        }
    }

    /**
     * @notice Start ramping up or down A parameter towards given futureA_ and futureTime_
     * Checks if the change is too rapid, and commits the new A value only when it falls under
     * the limit range.
     * @param self Swap struct to update
     * @param futureA_ the new A to ramp towards
     * @param futureTime_ timestamp when the new A should be reached
     */
    function rampA(
        Amplification storage self,
        uint256 futureA_,
        uint256 futureTime_
    ) external {
        require(
            block.timestamp >= self.initialATime + 1 days,
            "Wait 1 day before starting ramp"
        );
        require(
            futureTime_ >= block.timestamp + MIN_RAMP_TIME,
            "Insufficient ramp time"
        );
        require(
            futureA_ > 0 && futureA_ < MAX_A,
            "futureA_ must be > 0 and < MAX_A"
        );

        uint256 initialAPrecise = _getAPrecise(self);
        uint256 futureAPrecise = futureA_ * A_PRECISION;

        if (futureAPrecise < initialAPrecise) {
            require(
                futureAPrecise * MAX_A_CHANGE >= initialAPrecise,
                "futureA_ is too small"
            );
        } else {
            require(
                futureAPrecise <= initialAPrecise * MAX_A_CHANGE,
                "futureA_ is too large"
            );
        }

        self.initialA = initialAPrecise;
        self.futureA = futureAPrecise;
        self.initialATime = block.timestamp;
        self.futureATime = futureTime_;

        emit RampA(
            initialAPrecise,
            futureAPrecise,
            block.timestamp,
            futureTime_
        );
    }

    /**
     * @notice Stops ramping A immediately. Once this function is called, rampA()
     * cannot be called for another 24 hours
     * @param self Swap struct to update
     */
    function stopRampA(Amplification storage self) external {
        require(self.futureATime > block.timestamp, "Ramp is already stopped");

        uint256 currentA = _getAPrecise(self);
        self.initialA = currentA;
        self.futureA = currentA;
        self.initialATime = block.timestamp;
        self.futureATime = block.timestamp;

        emit StopRampA(currentA, block.timestamp);
    }

    // =============================================
    //            TOKEN INTERACTIONS
    // =============================================

    function getTokenBalance(PooledToken storage _token) external view returns (uint256) {
        return _getTokenBalance(_token);
    }

    function _getTokenBalance(PooledToken storage _token) internal view returns (uint256) {
        return _token.token.balanceOf(address(this));
    }
}