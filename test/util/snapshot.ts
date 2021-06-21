import hre from 'hardhat'

const sendAsync = async (method:string, arg?: any[] | undefined) => {
  return await hre.network.provider.send(method, arg)
}

const snapshot = async () => {
  return await sendAsync('evm_snapshot')
}

const revert = async (snapshotId: any) => {
  return await sendAsync('evm_revert', [snapshotId])
}

const blockNumber = async () => {
  return await sendAsync('eth_blockNumber')
}

export { sendAsync, snapshot, revert, blockNumber }
