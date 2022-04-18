import { ethers } from 'ethers'
const ethUtils = require('ethereumjs-util')
const Buffer = require('safe-buffer').Buffer
const BN = ethUtils.BN

export async function getSigs (wallets: any, votedata: any) {
  // avoid any potential side effects
  const copyWallets = [...wallets]

  copyWallets.sort((w1, w2) => {
    return w1._address.localeCompare(w2._address)
  })

  const h = Buffer.from(votedata)

  const signed = []
  for (let i = 0; i < copyWallets.length; i++) {
    signed.push(await copyWallets[i].provider.getSigner().signMessage(h))
  }
  return signed
}

export async function encodeSigsForCheckpoint (sigs = []) {
  const encodedSigs = []
  for (let i = 0; i < sigs.length; i++) {
    const buffer = Buffer.from((sigs[i] as string).slice(2), 'hex')
    encodedSigs.push([
      ethers.BigNumber.from(buffer.slice(0, 32)),
      ethers.BigNumber.from(buffer.slice(32, 64)),
      ethers.BigNumber.from(buffer.slice(64, 96))
    ])
  }
  return encodedSigs
}

export async function buildsubmitCheckpointPaylod (
  proposer: string,
  start: number,
  end: number,
  root: any,
  wallets: any[],
  options = { rewardsRootHash: '', allValidators: false, getSigs: false, totalStake: 1, sigPrefix: '' } // false vars are to show expected vars
) {
  const validators = wallets
  const abiCoder = new ethers.utils.AbiCoder()

  const data = abiCoder.encode(
    ['address', 'uint256', 'uint256', 'bytes32', 'bytes32', 'uint256'],
    [proposer, start, end, root, options.rewardsRootHash, 137]
  )
  const sigData = Buffer.concat([Buffer.from(options.sigPrefix || '0x01'), Buffer.from(data)])

  const sigs = await encodeSigsForCheckpoint((await getSigs(validators, ethUtils.keccak256(sigData))) as any)
  return { data, sigs }
}

export function getBlockHeader (block: any) {
  const n = new BN(block.number).toArrayLike(Buffer, 'be', 32)
  const ts = new BN(block.timestamp).toArrayLike(Buffer, 'be', 32)
  const txRoot = ethUtils.toBuffer(block.transactionsRoot)
  const receiptsRoot = ethUtils.toBuffer(block.receiptsRoot)
  return ethUtils.keccak256(Buffer.concat([n, ts, txRoot, receiptsRoot]))
}