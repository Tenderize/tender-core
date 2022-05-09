import { utils } from 'ethers'
import { task, types } from 'hardhat/config'
import { Tenderizer, TenderToken, TenderSwap, TenderFarm, LiquidityPoolToken } from '../typechain'

task('balances', 'check user balances for a tenderizer')
  .addParam('tenderizer', 'tenderizer name e.g. "Livepeer"', '', types.string)
  .addParam('address', 'address to check balances for', '', types.string)
  .setAction(async (args, hre) => {
    const { deployments, ethers } = hre

    if (!args.tenderizer) {
      throw new Error('Must provide Tenderizer name')
    }

    const tenderizer = (await deployments.get(args.tenderizer)).address

    const address = ethers.utils.getAddress(args.address)

    const Tenderizer: Tenderizer = (await ethers.getContractAt('Tenderizer', tenderizer)) as Tenderizer
    const TenderToken: TenderToken = (await ethers.getContractAt('TenderToken', await Tenderizer.tenderToken())) as TenderToken
    const TenderSwap: TenderSwap = (await ethers.getContractAt(
      'TenderSwap',
      await Tenderizer.tenderSwap()
    )) as TenderSwap

    const LpToken: LiquidityPoolToken = (await ethers.getContractAt('LiquidityPoolToken', await TenderSwap.lpToken())) as LiquidityPoolToken
    const TenderFarm = (await ethers.getContractAt('TenderFarm', await Tenderizer.tenderFarm())) as TenderFarm

    const tenderToken = await TenderToken.balanceOf(address)
    const swapToken = await LpToken.balanceOf(address)
    const farmed = await TenderFarm.stakeOf(address)

    console.log(utils.formatEther(await Tenderizer.currentPrincipal()))
    console.log(`Tender ${args.tenderizer}`, utils.formatEther(tenderToken))
    console.log(`SWAP ${args.tenderizer}`, utils.formatEther(swapToken))
    console.log(`Farmed for ${args.tenderizer}`, utils.formatEther(farmed))
  })
