import { ethers } from 'hardhat'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

import StakeManagerABI from '../abis/matic/StakeManager.json'
import RootChainABI from '../abis/matic/RootChain.json'

const MerkleTree = require('../../util/merkle-tree')

const ethUtils = require('ethereumjs-util')
const Buffer = require('safe-buffer').Buffer
const BN = ethUtils.BN

export const STAKE_MANAGER = '0x5e3Ef299fDDf15eAa0432E6e66473ace8c13D908'
export const ROOT_CHAIN = '0x86E4Dc95c7FBdBf52e33D563BbDB00823894C287'

export const CHILD_CHAIN_URL = 'https://matic-mainnet.chainstacklabs.com'

function encodeSigForCheckpoint (sig: any) {
  const buffer = Buffer.from((sig as string).slice(2), 'hex')
  return [
    ethers.BigNumber.from(buffer.slice(0, 32)),
    ethers.BigNumber.from(buffer.slice(32, 64)),
    ethers.BigNumber.from(buffer.slice(64, 96))
  ]
}

// return checkpoint data to sign
async function encodeCheckpointData (proposer: string, start: number, end:number, root: any, rewardsRootHash: any) {
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

async function getVoteSignature (wallet:any, data:any, yn: boolean) {
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

export async function voteForValidator (hre: HardhatRuntimeEnvironment, validatorID: number, data: any, yn: boolean) {
  console.log('signing for ID', validatorID)
  const MaticStakeManager = new ethers.Contract(STAKE_MANAGER, StakeManagerABI, hre.ethers.provider)
  const validator = await MaticStakeManager.validators(validatorID)

  try {
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [validator.signer]
    })
    const signer = await ethers.provider.getSigner(validator.signer)

    const signature = await getVoteSignature(signer, data, yn)

    await hre.network.provider.request({
      method: 'hardhat_stopImpersonatingAccount',
      params: [validator.signer]
    })

    return signature
  } catch (err) {
    console.log(err)
    return ''
  }
}

export async function buildCheckpointData (hre: HardhatRuntimeEnvironment, proposer: string) {
  const rootChain = new ethers.Contract(ROOT_CHAIN, RootChainABI, hre.ethers.provider)

  // Get block data from root chain
  const childWeb3 = new ethers.providers.JsonRpcProvider(CHILD_CHAIN_URL)
  const lastChildBlock = (await rootChain.getLastChildBlock()).toNumber()
  // Get only 10 blocks from child chian
  const start = lastChildBlock + 1
  const end = lastChildBlock + 11
  const headers = []
  for (let i = start; i <= end; i++) {
    const block = await childWeb3.getBlock(i)
    block.number = i
    headers.push(getBlockHeader(block))
  }

  const tree = new MerkleTree(headers)
  const root = ethUtils.bufferToHex(tree.getRoot())

  return await encodeCheckpointData(proposer, start, end, root, ethers.constants.HashZero)
}

export async function submitCheckpoint (hre: HardhatRuntimeEnvironment, proposer: string, data:any, signatures: any[]) {
  const rootChain = new ethers.Contract(ROOT_CHAIN, RootChainABI, hre.ethers.provider)

  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [proposer]
  })
  await rootChain.connect(await hre.ethers.getSigner(proposer)).submitCheckpoint(data, signatures, { gasLimit: 1000000 })

  // Transfer some MATIC
  await hre.network.provider.request({
    method: 'hardhat_stopImpersonatingAccount',
    params: [proposer]
  })
}
