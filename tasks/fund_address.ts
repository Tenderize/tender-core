import { task, types } from 'hardhat/config'

task('fund-address', 'send eth to an address')
  .addParam('address', 'address to send the funds to', undefined, types.string)
  .addParam('amount', 'amount to send', undefined, types.string)
  .setAction(async (args, hre) => {
    if (!args.address) {
      throw new Error('Must provide address')
    }
    if (!args.amount) {
      throw new Error('Must provide amount')
    }

    await hre.network.provider.send('hardhat_setBalance', [
      args.address,
      `0x${hre.ethers.utils.parseEther(args.amount).toString()}`
    ])
  })
