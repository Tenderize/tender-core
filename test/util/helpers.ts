import { ethers, BigNumber, Contract } from 'ethers'
import {
  keccak256,
  defaultAbiCoder,
  solidityPack,
  toUtf8Bytes
} from 'ethers/lib/utils'
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

const PERMIT_TYPEHASH = keccak256(
  toUtf8Bytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)')
)

function getDomainSeparator (name: string, tokenAddress: string) {
  return keccak256(
    defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [
        keccak256(toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
        keccak256(toUtf8Bytes(name)),
        keccak256(toUtf8Bytes('1')),
        31337,
        tokenAddress
      ]
    )
  )
}

export async function getApprovalDigest (
  token: Contract,
  approve: {
    owner: string
    spender: string
    value: BigNumber
  },
  nonce: BigNumber,
  deadline: BigNumber
): Promise<string> {
  const name = await token.name()
  const DOMAIN_SEPARATOR = getDomainSeparator(name, token.address)
  return keccak256(
    solidityPack(
      ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
      [
        '0x19',
        '0x01',
        DOMAIN_SEPARATOR,
        keccak256(
          defaultAbiCoder.encode(
            ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
            [PERMIT_TYPEHASH, approve.owner, approve.spender, approve.value, nonce, deadline]
          )
        )
      ]
    )
  )
}
