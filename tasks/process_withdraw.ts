import { task, types } from 'hardhat/config'
import { Graph } from '../typechain'

task('process-withdraw-graph', 'process withdraw')
  .addParam('tenderizer', 'tenderizer name e.g. "Livepeer"', '', types.string)
  .setAction(async (args, hre) => {
    const { deployments, ethers } = hre

    if (!args.tenderizer) {
      throw new Error('Must provide Tenderizer name')
    }
    const tenderizer = (await deployments.get(args.tenderizer)).address

    const Tenderizer: Graph = (await ethers.getContractAt('Graph', tenderizer)) as Graph

    try {
      const tx = await Tenderizer.processWithdraw()
      await tx.wait()
    } catch (e: any) {
      throw new Error(e.message)
    }
  })
