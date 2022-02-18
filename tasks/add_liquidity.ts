import { task, types } from 'hardhat/config'
import { TenderToken, Tenderizer, TenderSwap, ERC20 } from '../typechain'
import { signERC2612Permit } from 'eth-permit'
import { utils } from 'ethers'

task('add-liquidity', 'adds liquidity to pool')
  .addParam('tenderizer', 'tenderizer name e.g. "Livepeer"', '', types.string)
  .addParam('tokenamount', 'amount of staking token to add (in 10e18)', 0, types.float)
  .addParam('tenderamount', 'amount of tenderToken to add (in 10e18)', 0, types.float)
  .setAction(async (args, hre) => {
    const { deployments, ethers } = hre

    if (!args.tenderizer) {
      throw new Error('Must provide Tenderizer name')
    }

    const provider = hre.ethers.provider

    const signer = (await hre.ethers.getSigners())[0]

    const tokenAmount = utils.formatEther(args.tokenamount)
    const tenderAmount = utils.formatEther(args.tenderamount)

    const tenderizer = (await deployments.get(args.tenderizer)).address

    const Tenderizer: Tenderizer = (await ethers.getContractAt('Tenderizer', tenderizer)) as Tenderizer
    const TenderToken: TenderToken = (await ethers.getContractAt('TenderToken', await Tenderizer.tenderToken())) as TenderToken
    const Steak: ERC20 = (await ethers.getContractAt('ERC20', await Tenderizer.steak())) as ERC20
    const TenderSwap: TenderSwap = (await ethers.getContractAt(
      'TenderSwap',
      await Tenderizer.tenderSwap()
    )) as TenderSwap

    const deadline = Math.floor((new Date().getTime() + 20 * 60000) / 1000)
    const approveTx = await Steak.approve(TenderSwap.address, tokenAmount)
    await approveTx.wait()
    const tenderTokenApproval = await signERC2612Permit(
      provider,
      TenderToken.address,
      signer.address,
      TenderSwap.address,
      tokenAmount
    )

    const tx = await TenderSwap.multicall([
      TenderSwap.interface.encodeFunctionData('selfPermit', [
        TenderToken.address,
        tenderAmount,
        tenderTokenApproval.deadline,
        tenderTokenApproval.v,
        tenderTokenApproval.r,
        tenderTokenApproval.s
      ]),
      TenderSwap.interface.encodeFunctionData('addLiquidity', [[tenderAmount, tokenAmount], 0, deadline])
    ])

    await tx.wait()

    console.log('TenderToken reserve: ', utils.formatEther(await TenderSwap.getToken0Balance()))
    console.log('Steak Reserve: ', utils.formatEther(await TenderSwap.getToken1Balance()))
  })
