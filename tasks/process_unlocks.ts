import { task, types } from 'hardhat/config'
import { Graph } from '../typechain'

task('process-unlocks', 'process unlocks')
  .addParam('tenderizer', 'tenderizer name e.g. "Livepeer"', '', types.string)
  .setAction(async (args, hre) => {
    const { deployments, ethers } = hre

    if (!args.tenderizer) {
      throw new Error('Must provide Tenderizer name')
    }

    const tenderizer = (await deployments.get(args.tenderizer)).address

    try {
      const Tenderizer = (await ethers.getContractAt('Graph', tenderizer)) as Graph
      const tx = await Tenderizer.processUnstake()
      await tx.wait()
      console.log(tx)
    } catch (e: any) {
      throw new Error(e.message)
    }
  })
