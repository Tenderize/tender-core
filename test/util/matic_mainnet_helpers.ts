import { ethers } from 'ethers'
import { JsonRpcSigner } from '@ethersproject/providers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
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

export function encodeSigForCheckpoint (sig: any) {
  const buffer = Buffer.from((sig as string).slice(2), 'hex')
  return [
    ethers.BigNumber.from(buffer.slice(0, 32)),
    ethers.BigNumber.from(buffer.slice(32, 64)),
    ethers.BigNumber.from(buffer.slice(64, 96))
  ]
}

// return checkpoint data to sign
export async function encodeCheckpointData (proposer: string, start: number, end:number, root: any, rewardsRootHash: any) {
  const abiCoder = new ethers.utils.AbiCoder()

  const data = abiCoder.encode(
    ['address', 'uint256', 'uint256', 'bytes32', 'bytes32', 'uint256'],
    [proposer, start, end, root, rewardsRootHash, 137]
  )
  return data
}

export function getBlockHeader (block: any) {
  const n = new BN(block.number).toArrayLike(Buffer, 'be', 32)
  const ts = new BN(block.timestamp).toArrayLike(Buffer, 'be', 32)
  const txRoot = ethUtils.toBuffer(block.transactionsRoot)
  const receiptsRoot = ethUtils.toBuffer(block.receiptsRoot)
  return ethUtils.keccak256(Buffer.concat([n, ts, txRoot, receiptsRoot]))
}

export async function getSigsWithVotes (_wallets:JsonRpcSigner[], data:any, sigPrefix:string, maxYesVotes:any) {
  const wallets = [..._wallets]
  wallets.sort((w1, w2) => {
    return w1._address.localeCompare(w2._address)
  })

  const sigs = []

  for (let i = 0; i < wallets.length; i++) {
    let voteData

    if (i < maxYesVotes) {
      voteData = Buffer.concat([ethUtils.toBuffer(sigPrefix || '0x01'), ethUtils.toBuffer(data)])
    } else {
      voteData = Buffer.concat([ethUtils.toBuffer(sigPrefix || '0x02'), ethUtils.toBuffer(data)])
    }

    const voteHash = ethUtils.keccak256(voteData)
    voteData = ethUtils.toBuffer(voteHash)
    const signer = await wallets[i].provider.getSigner()
    console.log(await signer.getAddress())
    sigs.push(await (await wallets[i].provider.getSigner()).signMessage(voteData))
  }

  return sigs
}

export async function getVoteSignature (wallet:any, data:any, yn: boolean) {
  let voteData: any
  const sigData = ethUtils.toBuffer(data)

  if (yn) {
    voteData = Buffer.concat([ethUtils.toBuffer('0x01'), ethUtils.toBuffer(sigData)])
  } else {
    voteData = Buffer.concat([ethUtils.toBuffer('0x02'), ethUtils.toBuffer(sigData)])
  }

  const voteHash = ethUtils.keccak256(voteData)
  voteData = ethUtils.toBuffer(voteHash)
  return encodeSigForCheckpoint(await wallet.signMessage(voteData))
}
