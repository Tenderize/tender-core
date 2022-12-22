import { task, types } from 'hardhat/config'
import { Tenderizer, TenderToken } from '../typechain'
import { utils } from 'ethers'

task('unstake', 'unstake tenderTokens')
  .addParam('tenderizer', 'tenderizer name e.g. "Livepeer"', '', types.string)
  .addParam('amount', 'amount of tenderTokens to unstake', 0, types.float)
  .setAction(async (args, hre) => {
    const { deployments, ethers } = hre

    if (!args.tenderizer) {
      throw new Error('Must provide Tenderizer name')
    }

    const tokenAmount = utils.parseEther(args.amount.toString())

    const tenderizer = (await deployments.get(args.tenderizer)).address

    const Tenderizer: Tenderizer = (await ethers.getContractAt('Tenderizer', tenderizer)) as Tenderizer
    const TenderToken: TenderToken = (await ethers.getContractAt(
      'TenderToken',
      await Tenderizer.tenderToken()
    )) as TenderToken

    await TenderToken.approve(Tenderizer.address, tokenAmount)
    const id = await await Tenderizer.callStatic.unstake(tokenAmount)
    const tx = await Tenderizer.unstake(tokenAmount)
    await tx.wait()
    console.log(`unstake ${ethers.utils.formatEther(tokenAmount)}`)
    console.log(`unstake ID: ${id.toString()}`)
  })
