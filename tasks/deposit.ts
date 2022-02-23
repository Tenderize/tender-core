import { task, types } from 'hardhat/config'
import { Tenderizer, ERC20 } from '../typechain'
import { utils } from 'ethers'

task('deposit', 'deposit tokens, receive tenderTokens')
  .addParam('tenderizer', 'tenderizer name e.g. "Livepeer"', '', types.string)
  .addParam('tokenamount', 'amount of staking token to add (in 10e18)', 0, types.float)
  .setAction(async (args, hre) => {
    const { deployments, ethers } = hre

    if (!args.tenderizer) {
      throw new Error('Must provide Tenderizer name')
    }

    const tokenAmount = utils.parseEther(args.tokenamount.toString())

    const tenderizer = (await deployments.get(args.tenderizer)).address

    const Tenderizer: Tenderizer = (await ethers.getContractAt('Tenderizer', tenderizer)) as Tenderizer
    const Steak: ERC20 = (await ethers.getContractAt('ERC20', await Tenderizer.steak())) as ERC20

    let tx = await Steak.approve(Tenderizer.address, tokenAmount)
    await tx.wait()
    tx = await Tenderizer.deposit(tokenAmount)
    await tx.wait()
  })
