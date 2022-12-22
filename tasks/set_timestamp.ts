import { task, types } from 'hardhat/config'

task('set-timestamp', 'set timestamp for next block')
  .addParam('timestamp', 'timestamp to set', undefined, types.string)
  .setAction(async (args, hre) => {
    if (!args.timestamp) {
      throw new Error('Must provide timestamp')
    }

    const block1 = await hre.ethers.provider.getBlock('latest')
    console.log('time before:', block1.timestamp, blockTimestampToDate(block1.timestamp))
    await hre.network.provider.request({
      method: 'evm_setNextBlockTimestamp',
      params: [Number.parseInt(args.timestamp)]
    })
    await hre.network.provider.request({
      method: 'evm_mine'
    })
    const block2 = await hre.ethers.provider.getBlock('latest')
    console.log('time after :', block2.timestamp, blockTimestampToDate(block2.timestamp))
    console.log('diff       :', block2.timestamp - block1.timestamp)
  })

const blockTimestampToDate = (timestamp: number) => new Date(Number(timestamp) * 1000)
