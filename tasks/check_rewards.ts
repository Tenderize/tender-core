import { task, types } from 'hardhat/config'
import { Tenderizer, ERC20, ILivepeer, IGraph, IAudius, IMatic } from '../typechain'
import { BigNumber } from 'ethers'

task('checkPendingRewards', 'check pending rewards yet to be claimed')
  .addParam('tenderizer', 'tenderizer name e.g. "Livepeer"', '', types.string)
  .setAction(async (args, hre) => {
    const { deployments, ethers } = hre

    if (!args.tenderizer) {
      throw new Error('Must provide Tenderizer name')
    }

    const tenderizer = (await deployments.get(args.tenderizer)).address

    const Tenderizer: Tenderizer = (await ethers.getContractAt('Tenderizer', tenderizer)) as Tenderizer
    const Steak: ERC20 = (await ethers.getContractAt('ERC20', await Tenderizer.steak())) as ERC20

    const cp = await Tenderizer.totalStakedTokens()
    let steak: BigNumber = BigNumber.from(0)
    let stakingContract: any

    if(args.tenderizer == 'Livepeer'){
        stakingContract = (await ethers.getContractAt('ILivepeer', '0x35Bcf3c30594191d53231E4FF333E8A770453e40')) as ILivepeer
        steak = await stakingContract.pendingStake(tenderizer, ethers.constants.MaxUint256)
    } else if (args.tenderizer == 'Graph'){
        stakingContract = (await ethers.getContractAt('IGraph', '0xF55041E37E12cD407ad00CE2910B8269B01263b9')) as IGraph
        const node = await Tenderizer.node()
        const del = await stakingContract.getDelegation(node, tenderizer)
        const delPool = await stakingContract.delegationPools(node)
        steak = del.shares.mul(delPool.tokens).div(delPool.shares)
    } else if (args.tenderizer == 'Audius') {
        stakingContract = (await ethers.getContractAt('IAudius', '0x4d7968ebfD390D5E7926Cb3587C39eFf2F9FB225')) as IAudius
        steak =  await stakingContract.getTotalDelegatorStake(tenderizer)
    } else if (args.tenderizer == 'Matic') {
        stakingContract = (await ethers.getContractAt('IMatic', '0xb929B89153fC2eEd442e81E5A1add4e2fa39028f')) as IMatic
        const shares = await stakingContract.balanceOf(tenderizer)
        const exRate = await stakingContract.exchangeRate()
        const exRatePrecision = BigNumber.from('10').pow('29')
        steak = shares.mul(exRate).div(exRatePrecision)
    }

    console.log('Pending fees:', steak.sub(cp).toString())
  })
