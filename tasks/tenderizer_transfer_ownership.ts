// transfer gov rights
// transfer proxy ownership
// transfer tenderswap

import { task, types } from 'hardhat/config'
import { Tenderizer, TenderSwap, EIP173ProxyWithReceive } from '../typechain'

task('tenderizer-ownership', 'Set a new owner for the tenderizer contract')
  .addParam('tenderizer', 'tenderizer name e.g. "Livepeer"', '', types.string)
  .addParam('owner', 'new owner of the contracts')
  .setAction(async (args, hre) => {
    const { deployments, ethers } = hre

    if (!args.tenderizer) {
      throw new Error('Must provide Tenderizer name')
    }

    const tenderizer = (await deployments.get(args.tenderizer)).address

    const Tenderizer: Tenderizer = (await ethers.getContractAt('Tenderizer', tenderizer)) as Tenderizer
    const TenderizerAsProxy: EIP173ProxyWithReceive = (await ethers.getContractAt(
      'EIP173ProxyWithReceive',
      tenderizer
    )) as EIP173ProxyWithReceive
    const TenderSwap: TenderSwap = (await ethers.getContractAt(
      'TenderSwap',
      await Tenderizer.tenderSwap()
    )) as TenderSwap

    await (await Tenderizer.setGov(args.owner)).wait()
    console.log(`Governance for ${args.tenderizer} Tenderizer changed to ${await Tenderizer.gov()}`)
    await (await TenderizerAsProxy.transferOwnership(args.owner)).wait()
    console.log(`Proxy owner for ${args.tenderizer} Tenderizer changed to ${await TenderizerAsProxy.owner()}`)
    await (await TenderSwap.transferOwnership(args.owner)).wait()
    console.log(`TenderSwap owner for ${args.tenderizer} Tenderizer changed to ${await TenderSwap.owner()}`)
  })
