
import { providers } from 'ethers'
import { ethers, network } from 'hardhat'

// EVM methods

export async function forceAdvanceOneBlock (timestamp?: number): Promise<any> {
  const params = timestamp ? [timestamp] : []
  return ethers.provider.send('evm_mine', params)
}

export async function setTimestamp (timestamp: number): Promise<any> {
  return forceAdvanceOneBlock(timestamp)
}

export async function increaseTimestamp (timestampDelta: number): Promise<any> {
  await ethers.provider.send('evm_increaseTime', [timestampDelta])
  return forceAdvanceOneBlock()
}

export async function setNextTimestamp (timestamp: number): Promise<any> {
  const chainId = (await ethers.provider.getNetwork()).chainId

  switch (chainId) {
    case 31337: // buidler evm
      return ethers.provider.send('evm_setNextBlockTimestamp', [timestamp])
    case 1337: // ganache
    default:
      return setTimestamp(timestamp)
  }
}

export async function getCurrentBlockTimestamp (): Promise<number> {
  const block = await ethers.provider.getBlock('latest')
  return block.timestamp
}

export async function impersonateAccount (
  address: string
): Promise<providers.JsonRpcSigner> {
  await network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [address]
  })

  return ethers.provider.getSigner(address)
}
