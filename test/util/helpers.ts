import { ethers, BigNumber } from 'ethers'
import { PERC_DIVISOR } from './constants'

export function sharesToTokens (shares: BigNumber, totalShares: BigNumber, totalTokens: BigNumber): BigNumber {
  if (totalShares.eq(0)) {
    return ethers.constants.Zero
  }
  return shares.mul(totalTokens.mul(PERC_DIVISOR).div(totalShares)).div(PERC_DIVISOR)
}

export function tokensToShares (tokens:BigNumber, totalShares:BigNumber, totalTokens: BigNumber): BigNumber {
  if (totalShares.eq(0)) {
    return tokens
  }
  if (totalTokens.eq(0)) {
    return ethers.constants.Zero
  }

  return tokens.mul(totalShares.mul(PERC_DIVISOR).div(totalTokens)).div(PERC_DIVISOR)
}

export function percOf (amount: BigNumber, fracNum:BigNumber, fracDenom:BigNumber): BigNumber {
  return amount.mul(fracNum.mul(PERC_DIVISOR).div(fracDenom)).div(PERC_DIVISOR)
}

export function percOf2 (amount:BigNumber, fracNum:BigNumber): BigNumber {
  return amount.mul(fracNum).div(PERC_DIVISOR)
}

export async function asyncForEach<T> (
  array: Array<T>,
  callback: (item: T, index: number) => void
): Promise<void> {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index)
  }
}

export function getSighash (iface: ethers.utils.Interface, name: string) {
  return ethers.utils.Interface.getSighash(iface.getFunction(name))
}
