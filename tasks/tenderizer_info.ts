import { task, types } from 'hardhat/config'
import { TenderToken, Tenderizer, TenderSwap, ERC20, TenderFarm, LiquidityPoolToken } from '../typechain'

task('tenderizer-info', 'get contract addresses')
  .addParam('tenderizer', 'tenderizer name e.g. "Livepeer"', '', types.string)
  .setAction(async (args, hre) => {
    const { deployments, ethers } = hre

    if (!args.tenderizer) {
      throw new Error('Must provide Tenderizer name')
    }

    const tenderizer = (await deployments.get(args.tenderizer)).address

    const Tenderizer: Tenderizer = (await ethers.getContractAt('Tenderizer', tenderizer)) as Tenderizer
    const TenderToken: TenderToken = (await ethers.getContractAt('TenderToken', await Tenderizer.tenderToken())) as TenderToken
    const Steak: ERC20 = (await ethers.getContractAt('ERC20', await Tenderizer.steak())) as ERC20
    const TenderSwap: TenderSwap = (await ethers.getContractAt(
      'TenderSwap',
      await Tenderizer.tenderSwap()
    )) as TenderSwap

    const LpToken: LiquidityPoolToken = (await ethers.getContractAt('LiquidityPoolToken', await TenderSwap.lpToken())) as LiquidityPoolToken
    const TenderFarm = (await ethers.getContractAt('TenderFarm', await Tenderizer.tenderFarm())) as TenderFarm

    console.log('Tenderizer Implementation', await ethers.provider.getStorageAt(Tenderizer.address, '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'))
    console.log(`Tenderizer ${Tenderizer.address}`)
    console.log(`TenderToken ${TenderToken.address}`)
    console.log(`Staking Token ${Steak.address}`)
    console.log(`TenderSwap ${TenderSwap.address}`)
    console.log(`LP Token ${LpToken.address}`)
    console.log(`TenderFarm ${TenderFarm.address}`)
  })
