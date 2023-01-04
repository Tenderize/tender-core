import { task, types } from 'hardhat/config'
import { Graph } from '../typechain'

task('migrate-unlock', 'unlock funds from old node and migrate to new node')
  .addParam('tenderizer', 'tenderizer name e.g. "Livepeer"', '', types.string)
  .addParam('newnode', 'address of new node', '', types.string)
  .setAction(async (args, hre) => {
    const { deployments, ethers } = hre

    if (!args.tenderizer) {
      throw new Error('Must provide Tenderizer name')
    }

    if (!args.newnode) {
      throw new Error('Must provide new node address')
    }

    const tenderizer = (await deployments.get(args.tenderizer)).address

    try {
      const Tenderizer = (await ethers.getContractAt('Graph', tenderizer)) as Graph
      const tx = await Tenderizer.migrateUnlock(args.newnode)
      await tx.wait()
      console.log(tx)
    } catch (e: any) {
      throw new Error(e.message)
    }
  })
