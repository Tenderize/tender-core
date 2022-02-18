import { task, types } from 'hardhat/config'
import { Tenderizer } from '../typechain'

task('rebase', 'process staking rewards for a Tenderizer')
  .addParam('tenderizer', 'tenderizer name e.g. "Livepeer"', '', types.string)
  .setAction(async (args, hre) => {
    const { deployments, ethers } = hre

    if (!args.tenderizer) {
      throw new Error('Must provide Tenderizer name')
    }

    const tenderizer = (await deployments.get(args.tenderizer)).address

    const Tenderizer: Tenderizer = (await ethers.getContractAt('Tenderizer', tenderizer)) as Tenderizer

    try {
      const tx = await Tenderizer.claimRewards()
      await tx.wait()
    } catch (e: any) {
      throw new Error(e.message)
    }
  })
