import { task, types } from 'hardhat/config'
import { Tenderizer, LiquidityPoolToken, TenderFarm, TenderSwap } from '../typechain'
import { utils } from 'ethers'

task('farm', 'farm SWAP tokens to receive rewards')
  .addParam('tenderizer', 'tenderizer name e.g. "Livepeer"', '', types.string)
  .addParam('receiver', 'address to farm tokens for', '', types.string)
  .addParam('tokenamount', 'amount of LP tokens to farm (in 10e18)', 0, types.float)
  .setAction(async (args, hre) => {
    const { deployments, ethers, getNamedAccounts } = hre

    const { deployer } = await getNamedAccounts()

    let receiver
    if (!args.receiver) {
      const signer = (await ethers.getSigners())[0]
      receiver = signer.address
    } else {
      receiver = args.receiver
    }

    if (!args.tenderizer) {
      throw new Error('Must provide Tenderizer name')
    }

    const tokenAmount = utils.parseEther(args.tokenamount.toString())

    const tenderizer = (await deployments.get(args.tenderizer)).address

    const Tenderizer: Tenderizer = (await ethers.getContractAt('Tenderizer', tenderizer)) as Tenderizer
    const TenderSwap: TenderSwap = (await ethers.getContractAt('TenderSwap', await Tenderizer.tenderSwap())) as TenderSwap
    const LPToken: LiquidityPoolToken = (await ethers.getContractAt('LiquidityPoolToken', await TenderSwap.lpToken())) as LiquidityPoolToken
    const TenderFarm: TenderFarm = (await ethers.getContractAt('TenderFarm', await Tenderizer.tenderFarm())) as TenderFarm

    let tx = await LPToken.approve(TenderFarm.address, tokenAmount)
    await tx.wait()
    tx = await TenderFarm.farmFor(receiver, tokenAmount)
    await tx.wait()
    console.log(`Farmed ${args.tokenamount} SWAP tokens for ${args.tenderizer} TenderFarm`)
  })
