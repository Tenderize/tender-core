import { task, types } from 'hardhat/config'
import { TenderToken, Tenderizer, TenderSwap, ERC20, TenderFarm, Registry } from '../typechain'

task('register', 'get contract addresses')
  .addParam('tenderizer', 'tenderizer name e.g. "Livepeer"', '', types.string)
  .addParam('subgraphname', 'id to use for the tenderizer on the subgraph', '', types.string)
  .setAction(async (args, hre) => {
    const { deployments, ethers } = hre

    if (!args.tenderizer) {
      throw new Error('Must provide Tenderizer name')
    }

    const tenderizer = (await deployments.get(args.tenderizer)).address
    const registry = (await deployments.get('Registry')).address

    const Tenderizer: Tenderizer = (await ethers.getContractAt('Tenderizer', tenderizer)) as Tenderizer
    const TenderToken: TenderToken = (await ethers.getContractAt('TenderToken', await Tenderizer.tenderToken())) as TenderToken
    const Steak: ERC20 = (await ethers.getContractAt('ERC20', await Tenderizer.steak())) as ERC20
    const TenderSwap: TenderSwap = (await ethers.getContractAt(
      'TenderSwap',
      await Tenderizer.tenderSwap()
    )) as TenderSwap

    const TenderFarm = (await ethers.getContractAt('TenderFarm', await Tenderizer.tenderFarm())) as TenderFarm

    const Registry: Registry = (await ethers.getContractAt('Registry', registry)) as Registry

    await Registry.addTenderizer({
      name: args.subgraphname,
      steak: Steak.address,
      tenderizer: Tenderizer.address,
      tenderToken: TenderToken.address,
      tenderFarm: TenderFarm.address,
      tenderSwap: TenderSwap.address
    })
  })
