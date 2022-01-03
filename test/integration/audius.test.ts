import hre, { ethers } from 'hardhat'
import {
  SimpleToken, Tenderizer, TenderToken, AudiusMock, TenderFarm, TenderSwap, LiquidityPoolToken
} from '../../typechain'
import { percOf2 } from '../util/helpers'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { Deployment } from 'hardhat-deploy/dist/types'
import { BigNumber } from '@ethersproject/bignumber'

import initialStateTests from './behaviors/initialState.behavior'
import depositTests from './behaviors/deposit.behavior'
import stakeTests from './behaviors/stake.behavior'
import {
  stakeIncreaseTests,
  stakeStaysSameTests,
  stakeDecreaseTests
} from './behaviors/rebase.behavior'
import {
  protocolFeeTests,
  liquidityFeeTests
} from './behaviors/fees.behavior'
import swapTests from './behaviors/swap.behavior'
import unlockTests from './behaviors/govBasedUnlock.behavior'
import withdrawTests from './behaviors/govBasedWithdrawal.behavior'
import upgradeTests from './behaviors/upgrade.behavior'
import setterTests from './behaviors/setters.behavior'

import { getCurrentBlockTimestamp } from '../util/evm'

chai.use(solidity)

describe('Audius Integration Test', () => {
  let AudiusMock: AudiusMock

  let Audius: {[name: string]: Deployment}

  const protocolFeesPercent = ethers.utils.parseEther('0.025')
  const liquidityFeesPercent = ethers.utils.parseEther('0.025')

  before('get signers', async function () {
    const namedAccs = await hre.getNamedAccounts()
    this.signers = await ethers.getSigners()

    this.deployer = namedAccs.deployer
  })

  before('deploy Audius token', async function () {
    const SimpleTokenFactory = await ethers.getContractFactory(
      'SimpleToken',
      this.signers[0]
    )

    this.Steak = (await SimpleTokenFactory.deploy('Audius Token', 'AUDIO', ethers.utils.parseEther('1000000'))) as SimpleToken
  })

  before('deploy Audius', async function () {
    const AudiusFac = await ethers.getContractFactory(
      'AudiusMock',
      this.signers[0]
    )

    AudiusMock = (await AudiusFac.deploy(this.Steak.address)) as AudiusMock
    this.StakingContract = AudiusMock
  })

  const STEAK_AMOUNT = '100000'

  before('deploy Audius Tenderizer', async function () {
    this.NODE = '0xf4e8Ef0763BCB2B1aF693F5970a00050a6aC7E1B'
    process.env.NAME = 'Audius'
    process.env.SYMBOL = 'AUDIO'
    process.env.CONTRACT = AudiusMock.address
    process.env.TOKEN = this.Steak.address
    process.env.VALIDATOR = this.NODE
    process.env.STEAK_AMOUNT = STEAK_AMOUNT

    this.methods = {
      stake: 'delegateStake',
      unstake: 'requestUndelegateStake',
      withdrawStake: 'undelegateStake'
    }

    this.NAME = process.env.NAME
    this.SYMBOL = process.env.SYMBOL
    this.initialStake = ethers.utils.parseEther(STEAK_AMOUNT).div('2')
    this.deposit = ethers.utils.parseEther('100')
    // For porotocols where there is a tax to stake
    this.DELEGATION_TAX = BigNumber.from(0)
    this.MAX_PPM = BigNumber.from(1000000)

    this.unbondLockID = 0
    this.govUnboundLockID = 1

    Audius = await hre.deployments.fixture(['Audius'], {
      keepExistingDeployments: false
    })
    this.Tenderizer = (await ethers.getContractAt('Tenderizer', Audius.Audius.address)) as Tenderizer
    this.TenderizerImpl = (await ethers.getContractAt('Tenderizer', Audius.Audius_Implementation.address)) as Tenderizer
    this.TenderToken = (await ethers.getContractAt('TenderToken', await this.Tenderizer.tenderToken())) as TenderToken
    this.TenderSwap = (await ethers.getContractAt('TenderSwap', await this.Tenderizer.tenderSwap())) as TenderSwap
    this.TenderFarm = (await ethers.getContractAt('TenderFarm', Audius.TenderFarm.address)) as TenderFarm
    this.LpToken = (await ethers.getContractAt('LiquidityPoolToken', await this.TenderSwap.lpToken())) as LiquidityPoolToken

    // Set contract variables
    await this.Tenderizer.setProtocolFee(protocolFeesPercent)
    await this.Tenderizer.setLiquidityFee(liquidityFeesPercent)

    // Deposit initial stake
    await this.Steak.approve(this.Tenderizer.address, this.initialStake)
    await this.Tenderizer.deposit(this.initialStake)
    // await this.Tenderizer.claimRewards()
    // Add initial liquidity
    await this.Steak.approve(this.TenderSwap.address, this.initialStake)
    await this.TenderToken.approve(this.TenderSwap.address, this.initialStake)
    const lpTokensOut = await this.TenderSwap.calculateTokenAmount([this.initialStake, this.initialStake], true)
    await this.TenderSwap.addLiquidity([this.initialStake, this.initialStake], lpTokensOut, (await getCurrentBlockTimestamp()) + 1000)
    console.log('added liquidity')
    console.log('calculated', lpTokensOut.toString(), 'actual', (await this.LpToken.balanceOf(this.deployer)).toString())
    await this.LpToken.approve(this.TenderFarm.address, lpTokensOut)
    await this.TenderFarm.farm(lpTokensOut)
    console.log('farmed LP tokens')
  })

  // Run tests
  describe('Initial State', initialStateTests.bind(this))
  describe('Deposit', depositTests.bind(this))
  describe('Stake', stakeTests.bind(this))

  let liquidityFees: BigNumber
  let protocolFees: BigNumber
  let newStake: BigNumber
  describe('Rebases', async function () {
    context('Positive Rebase', async function () {
      before(async function () {
        this.increase = ethers.utils.parseEther('10')
        liquidityFees = percOf2(this.increase, liquidityFeesPercent)
        protocolFees = percOf2(this.increase, protocolFeesPercent)
        newStake = this.deposit.add(this.initialStake).add(this.increase)
        this.newStakeMinusFees = newStake.sub(liquidityFees.add(protocolFees))

        // set increase on mock
        await this.StakingContract.setStaked(this.increase.add(await this.StakingContract.staked()))

        // With mock values set correctly, adjust increase with fees
        // for assertions
        this.increase = this.increase.sub(protocolFees.add(liquidityFees))
      })
      describe('Stake increases', stakeIncreaseTests.bind(this))
    })

    context('Neutral Rebase', async function () {
      before(async function () {
        this.stakeMinusFees = newStake.sub(liquidityFees.add(protocolFees))
      })
      describe('Stake stays the same', stakeStaysSameTests.bind(this))
    })

    context('Negative Rebase', async function () {
      before(async function () {
        const stake = await this.StakingContract.staked()
        this.decrease = ethers.utils.parseEther('10')
        // reduced stake is current stake - 100 from rewards previously
        const reducedStake = stake.sub(this.decrease)
        this.expectedCP = reducedStake.sub(liquidityFees).sub(protocolFees)
        // reduce staked on mock
        await this.StakingContract.setStaked(reducedStake)
      })
      describe('Stake decreases', stakeDecreaseTests.bind(this))
    })
  })

  describe('Collect fees', protocolFeeTests.bind(this))
  describe('Collect Liquidity fees', liquidityFeeTests.bind(this))
  describe('Swap', swapTests.bind(this))

  describe('Unlock and Withdraw', async function () {
    before(async function () {
      this.withdrawAmount = await this.TenderToken.balanceOf(this.deployer)
      await this.StakingContract.setStaked(
        await this.Tenderizer.totalStakedTokens()
      )
    })
    describe('Unstake', unlockTests.bind(this))
    describe('Withdrawl', withdrawTests.bind(this))
  })
  describe('Upgrades', upgradeTests.bind(this))
  describe('Setting contract variables', setterTests.bind(this))
})
