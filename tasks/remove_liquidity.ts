import { task, types } from 'hardhat/config'
import { Tenderizer, TenderSwap, LiquidityPoolToken } from '../typechain'
import { utils } from 'ethers'

task('remove-liquidity', 'adds liquidity to pool')
  .addParam('tenderizer', 'tenderizer name e.g. "Livepeer"', '', types.string)
  .setAction(async (args, hre) => {
    const { deployments, ethers } = hre

    if (!args.tenderizer) {
      throw new Error('Must provide Tenderizer name')
    }

    const deadline = Math.floor((new Date().getTime() + 20 * 60000) / 1000)

    const signer = (await ethers.getSigners())[0]

    const tenderizer = (await deployments.get(args.tenderizer)).address

    const Tenderizer: Tenderizer = (await ethers.getContractAt('Tenderizer', tenderizer)) as Tenderizer
    const TenderSwap: TenderSwap = (await ethers.getContractAt(
      'TenderSwap',
      await Tenderizer.tenderSwap()
    )) as TenderSwap

    const LpToken: LiquidityPoolToken = (await ethers.getContractAt(
      'LiquidityPoolToken',
      await TenderSwap.lpToken()
    )) as LiquidityPoolToken

    const balance = await LpToken.balanceOf(signer.address)

    const calc = await TenderSwap.calculateRemoveLiquidity(balance)

    await LpToken.approve(TenderSwap.address, balance)
    const tx = await TenderSwap.removeLiquidity(balance, calc, deadline)
    await tx.wait()

    console.log(calc[0].toString(), calc[1].toString())

    console.log('TenderToken reserve: ', utils.formatEther(await TenderSwap.getToken0Balance()))
    console.log('Steak Reserve: ', utils.formatEther(await TenderSwap.getToken1Balance()))
    console.log('virtual price', utils.formatEther(await TenderSwap.getVirtualPrice()))
  })
