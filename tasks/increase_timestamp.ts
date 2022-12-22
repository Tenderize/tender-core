import { task, types } from 'hardhat/config'

task('increase-time', 'increase timestamp with time for next block')
  .addParam('time', 'the amount of time to increase with', undefined, types.string)
  .setAction(async (args, hre) => {
    if (!args.time) {
      throw new Error('Must provide time')
    }

    const block1 = await hre.ethers.provider.getBlock('latest')
    console.log('time before:', block1.timestamp, blockTimestampToDate(block1.timestamp))
    await hre.network.provider.request({
      method: 'evm_increaseTime',
      params: [Number.parseInt(args.time)]
    })
    await hre.network.provider.request({
      method: 'evm_mine'
    })
    const block2 = await hre.ethers.provider.getBlock('latest')
    console.log('time after :', block2.timestamp, blockTimestampToDate(block2.timestamp))
  })

const blockTimestampToDate = (timestamp: number) => new Date(Number(timestamp) * 1000)
