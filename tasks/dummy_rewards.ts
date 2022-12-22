import { task, types } from 'hardhat/config'
import { DummyStaking } from '../typechain'

task('dummy-rewards', 'deploy DummyStaking')
  .addParam('dummy', 'dummy address', '')
  .addParam('amount', 'initial supply', '10', types.float)
  .setAction(async (args, hre) => {
    const { ethers } = hre

    const tokenAmount = ethers.utils.parseEther(args.amount.toString())

    const DummyStaking: DummyStaking = (await ethers.getContractAt('DummyStaking', args.dummy)) as DummyStaking

    await DummyStaking.addRewards(tokenAmount)
  })
