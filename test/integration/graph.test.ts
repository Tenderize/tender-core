import hre, { ethers } from 'hardhat'

import { MockContract, smockit } from '@eth-optimism/smock'

import {
  SimpleToken, Tenderizer, TenderToken, IGraph, TenderFarm, TenderSwap, LiquidityPoolToken
} from '../../typechain'

import { percOf2 } from '../util/helpers'

import chai from 'chai'
import {
  solidity
} from 'ethereum-waffle'
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

describe('Graph Integration Test', () => {
  let GraphNoMock: IGraph
  let GraphMock: MockContract

  let Graph: {[name: string]: Deployment}

  const protocolFeesPercent = ethers.utils.parseEther('0.025')
  const liquidityFeesPercent = ethers.utils.parseEther('0.025')

  before('get signers', async function () {
    const namedAccs = await hre.getNamedAccounts()
    this.signers = await ethers.getSigners()

    this.deployer = namedAccs.deployer
  })

  before('deploy Graph token', async function () {
    const SimpleTokenFactory = await ethers.getContractFactory(
      'SimpleToken',
      this.signers[0]
    )

    this.Steak = (await SimpleTokenFactory.deploy('Graph Token', 'GRT', ethers.utils.parseEther('1000000'))) as SimpleToken
  })

  before('deploy Graph', async function () {
    const GraphFac = await ethers.getContractFactory(
      'GraphMock',
      this.signers[0]
    )

    GraphNoMock = (await GraphFac.deploy(this.Steak.address)) as IGraph
    this.StakingContractNoMock = GraphNoMock

    GraphMock = await smockit(GraphNoMock)
  })

  const STEAK_AMOUNT = '100000'

  before('deploy Graph Tenderizer', async function () {
    this.NODE = '0xf4e8Ef0763BCB2B1aF693F5970a00050a6aC7E1B'
    process.env.NAME = 'Graph'
    process.env.SYMBOL = 'GRT'
    process.env.CONTRACT = GraphMock.address
    process.env.TOKEN = this.Steak.address
    process.env.VALIDATOR = this.NODE
    process.env.STEAK_AMOUNT = STEAK_AMOUNT

    this.NAME = process.env.NAME
    this.initialStake = ethers.utils.parseEther(STEAK_AMOUNT).div('2')
    this.deposit = ethers.utils.parseEther('100')

    this.unbondLockID = 0
    this.govUnboundLockID = 1
    // For porotocols where there is a tax to stake
    this.DELEGATION_TAX = BigNumber.from(5000)
    this.MAX_PPM = BigNumber.from(1000000)

    GraphMock.smocked.delegationTaxPercentage.will.return.with(this.DELEGATION_TAX)
    Graph = await hre.deployments.fixture(['Graph'], {
      keepExistingDeployments: false
    })
    this.Tenderizer = (await ethers.getContractAt('Tenderizer', Graph.Graph.address)) as Tenderizer
    this.TenderizerImpl = (await ethers.getContractAt('Tenderizer', Graph.Graph_Implementation.address)) as Tenderizer
    this.TenderToken = (await ethers.getContractAt('TenderToken', await this.Tenderizer.tenderToken())) as TenderToken
    this.TenderSwap = (await ethers.getContractAt('TenderSwap', await this.Tenderizer.tenderSwap())) as TenderSwap
    this.TenderFarm = (await ethers.getContractAt('TenderFarm', Graph.TenderFarm.address)) as TenderFarm
    this.LpToken = (await ethers.getContractAt('LiquidityPoolToken', await this.TenderSwap.lpToken())) as LiquidityPoolToken

    // Set contract variables
    await this.Tenderizer.setProtocolFee(protocolFeesPercent)
    await this.Tenderizer.setLiquidityFee(liquidityFeesPercent)

    // Deposit initial stake
    await this.Steak.approve(this.Tenderizer.address, this.initialStake)
    await this.Tenderizer.deposit(this.initialStake)
    // await this.Tenderizer.claimRewards()
    // Add initial liquidity
    const tokensAfterTax = this.initialStake.sub(this.initialStake.mul(this.DELEGATION_TAX).div(this.MAX_PPM))
    await this.Steak.approve(this.TenderSwap.address, tokensAfterTax)
    await this.TenderToken.approve(this.TenderSwap.address, tokensAfterTax)
    const lpTokensOut = await this.TenderSwap.calculateTokenAmount([tokensAfterTax, tokensAfterTax], true)
    await this.TenderSwap.addLiquidity([tokensAfterTax, tokensAfterTax], lpTokensOut, (await getCurrentBlockTimestamp()) + 1000)
    console.log('HEAREAS')
    console.log('added liquidity')
    console.log('calculated', lpTokensOut.toString(), 'actual', (await this.LpToken.balanceOf(this.deployer)).toString())
    await this.LpToken.approve(this.TenderFarm.address, lpTokensOut)
    await this.TenderFarm.farm(lpTokensOut)
    console.log('farmed LP tokens')

    // Setup Mocks for assertions
    // Note: Mocks not needed for assertions can be set in before hooks here
    this.stakeMock = {}
    this.stakeMock.function = GraphMock.smocked.delegate
    // TODO: Use name everywhere and just pass entire GraphMock.smocked
    this.stakeMock.functionName = 'delegate'
    this.stakeMock.nodeParam = '_indexer'
    this.stakeMock.amountParam = '_tokens'

    this.withdrawRewardsMock = null // No need to withdraw with Graph

    this.unbondMock = {}
    this.unbondMock.function = GraphMock.smocked.undelegate
    this.unbondMock.nodeParam = '_indexer'
    this.unbondMock.amountParam = '_shares'

    this.withdrawMock = {}
    this.withdrawMock.function = GraphMock.smocked.withdrawDelegated
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
        newStake = this.deposit.add(this.initialStake)
          .sub(this.deposit.add(this.initialStake).mul(this.DELEGATION_TAX).div(this.MAX_PPM))
          .add(this.increase)
        this.newStakeMinusFees = newStake.sub(liquidityFees.add(protocolFees))
        GraphMock.smocked.getDelegation.will.return.with({
          shares: 100,
          tokensLocked: 0,
          tokensLockedUntil: 0
        })
        GraphMock.smocked.delegationPools.will.return.with({
          tokens: newStake,
          shares: 100,
          cooldownBlocks: 0,
          indexingRewardCut: 0,
          queryFeeCut: 0,
          updatedAtBlock: 0
        })
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
        const reducedStake = this.deposit.add(this.initialStake)
          .sub(this.deposit.add(this.initialStake).mul(this.DELEGATION_TAX).div(this.MAX_PPM))
        this.expectedCP = reducedStake.sub(liquidityFees).sub(protocolFees)
        GraphMock.smocked.getDelegation.will.return.with({
          shares: 100,
          tokensLocked: 0,
          tokensLockedUntil: 0
        })
        GraphMock.smocked.delegationPools.will.return.with({
          tokens: reducedStake,
          shares: 100,
          cooldownBlocks: 0,
          indexingRewardCut: 0,
          queryFeeCut: 0,
          updatedAtBlock: 0
        })
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
      GraphMock.smocked.getDelegation.will.return.with({
        shares: 100,
        tokensLocked: 0,
        tokensLockedUntil: 0
      })
      GraphMock.smocked.delegationPools.will.return.with({
        tokens: 100, // TODO: Check this !
        shares: 100,
        cooldownBlocks: 0,
        indexingRewardCut: 0,
        queryFeeCut: 0,
        updatedAtBlock: 0
      })
    })
    describe('Unstake', unlockTests.bind(this))
    describe('Withdrawl', withdrawTests.bind(this))
  })
  describe('Upgrades', upgradeTests.bind(this))
  describe('Setting contract variables', setterTests.bind(this))
})
