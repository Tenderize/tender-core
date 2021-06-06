import { ethers,BigNumber } from 'ethers'
import {PERC_DIVISOR} from './constants'

export function sharesToTokens(shares: BigNumber, totalShares: BigNumber, totalTokens: BigNumber): BigNumber {
    if (totalShares.eq(0)) {
        return ethers.constants.Zero
    }
    return shares.mul(totalTokens.mul(PERC_DIVISOR).div(totalShares)).div(PERC_DIVISOR)
}

export function tokensToShares(tokens:BigNumber, totalShares:BigNumber, totalTokens: BigNumber): BigNumber {
    if (totalShares.eq(0)) {
        return tokens
    }
    if (totalTokens.eq(0)) {
        return ethers.constants.Zero
    }

    return tokens.mul(totalShares.mul(PERC_DIVISOR).div(totalTokens)).div(PERC_DIVISOR)
}