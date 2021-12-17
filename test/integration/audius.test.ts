import hre, { ethers } from 'hardhat'
import { MockContract, smockit } from '@eth-optimism/smock'
import {
  SimpleToken, Controller, Tenderizer, TenderToken, IAudius, TenderFarm, TenderSwap, LiquidityPoolToken
} from '../../typechain'
import { percOf2 } from '../util/helpers'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { Deployment } from 'hardhat-deploy/dist/types'
import { BigNumber } from '@ethersproject/bignumber'

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
  let AudiusNoMock: IAudius
  let AudiusMock: MockContract

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

    AudiusNoMock = (await AudiusFac.deploy(this.Steak.address)) as IAudius
    this.StakingContractNoMock = AudiusNoMock

    AudiusMock = await smockit(AudiusNoMock)
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

    this.NAME = process.env.NAME
    this.initialStake = ethers.utils.parseEther(STEAK_AMOUNT).div('2')
    this.deposit = ethers.utils.parseEther('100')
    // For porotocols where there is a tax to stake
    this.DELEGATION_TAX = BigNumber.from(0)
    this.MAX_PPM = BigNumber.from(1000000)

    this.unbondLockID = 0
    this.govUnboundLockID = 1

    const dummyStakingAddress = '0xfA668FB97697200FA56ce98E246db61Cc7E14Bd5'
    AudiusMock.smocked.getStakingAddress.will.return.with(dummyStakingAddress)
    Audius = await hre.deployments.fixture(['Audius'], {
      keepExistingDeployments: false
    })
    this.Controller = (await ethers.getContractAt('Controller', Audius.Controller.address)) as Controller
    this.Tenderizer = (await ethers.getContractAt('Tenderizer', Audius.Audius.address)) as Tenderizer
    this.TenderizerImpl = (await ethers.getContractAt('Tenderizer', Audius.Audius_Implementation.address)) as Tenderizer
    this.TenderToken = (await ethers.getContractAt('TenderToken', await this.Controller.tenderToken())) as TenderToken
    this.TenderSwap = (await ethers.getContractAt('TenderSwap', await this.Controller.tenderSwap())) as TenderSwap
    this.TenderFarm = (await ethers.getContractAt('TenderFarm', Audius.TenderFarm.address)) as TenderFarm
    this.LpToken = (await ethers.getContractAt('LiquidityPoolToken', await this.TenderSwap.lpToken())) as LiquidityPoolToken
    await this.Controller.batchExecute(
      [this.Tenderizer.address, this.Tenderizer.address],
      [0, 0],
      [this.Tenderizer.interface.encodeFunctionData('setProtocolFee', [protocolFeesPercent]),
        this.Tenderizer.interface.encodeFunctionData('setLiquidityFee', [liquidityFeesPercent])]
    )

    // Deposit initial stake
    await this.Steak.approve(this.Controller.address, this.initialStake)
    await this.Controller.deposit(this.initialStake)
    await this.Controller.gulp()
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

    // Setup Mocks for assertions
    // Note: Mocks not needed for assertions can be set in before hooks here
    this.stakeMock = {}
    this.stakeMock.function = AudiusMock.smocked.delegateStake
    // TODO: Use name everywhere and just pass entire AudiusMock.smocked
    this.stakeMock.functionName = 'delegateStake'
    this.stakeMock.nodeParam = '_targetSP'
    this.stakeMock.amountParam = '_amount'

    this.withdrawRewardsMock = null // No need to withdraw with Audius\

    this.unbondMock = {}
    this.unbondMock.function = AudiusMock.smocked.requestUndelegateStake
    this.unbondMock.nodeParam = '_target'
    this.unbondMock.amountParam = '_amount'

    this.withdrawMock = {}
    this.withdrawMock.function = AudiusMock.smocked.undelegateStake
  })

  // Run tests
  describe('Deposit', depositTests.bind(this))
  describe('Stake', stakeTests.bind(this))

  let liquidityFees: BigNumber
  let protocolFees: BigNumber
  let newStake: BigNumber
  describe('Rebases', async function () {
    context('Positive Rebase', async function () {
      before(async function () {
        this.increase = ethers.BigNumber.from('10000000000')
        liquidityFees = percOf2(this.increase, liquidityFeesPercent)
        protocolFees = percOf2(this.increase, protocolFeesPercent)
        newStake = this.deposit.add(this.initialStake).add(this.increase)
        this.newStakeMinusFees = newStake.sub(liquidityFees.add(protocolFees))
        AudiusMock.smocked.getTotalDelegatorStake.will.return.with(newStake)
      })
      describe('Stake increases', stakeIncreaseTests.bind(this))
    })

    context('Neutral Rebase', async function () {
      before(async function () {
        this.stakeMinusFees = newStake.sub(liquidityFees.add(protocolFees))
        AudiusMock.smocked.getTotalDelegatorStake.will.return.with(newStake)
      })
      describe('Stake stays the same', stakeStaysSameTests.bind(this))
    })

    context('Negative Rebase', async function () {
      before(async function () {
        const reducedStake = this.deposit.add(this.initialStake)
        this.expectedCP = reducedStake.sub(liquidityFees).sub(protocolFees)
        AudiusMock.smocked.getTotalDelegatorStake.will.return.with(reducedStake)
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
      AudiusMock.smocked.getTotalDelegatorStake.will.return.with(this.withdrawAmount)
    })
    describe('Unstake', unlockTests.bind(this))
    describe('Withdrawl', withdrawTests.bind(this))
  })
  describe('Upgrades', upgradeTests.bind(this))
  describe('Setting contract variables', setterTests.bind(this))
})
