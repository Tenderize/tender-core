import hre, { ethers } from 'hardhat'

import { MockContract, smockit } from '@eth-optimism/smock'

import {
  SimpleToken, Controller, TenderToken, ILivepeer, Livepeer, ISwapRouterWithWETH, IWETH, TenderFarm, TenderSwap, LiquidityPoolToken
} from '../../typechain/'

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
import {
  userBasedUnlockByUser,
  govUnbondRevertIfNoStake,
  userBasedUnlockByGov
} from './behaviors/userBasedUnlock.behavior'
import userBasedWithdrawalTests from './behaviors/userBasedWithdrawal.behavior'
import upgradeTests from './behaviors/upgrade.behavior'
import setterTests from './behaviors/setters.behavior'
import { percOf2 } from '../util/helpers'
import { getCurrentBlockTimestamp } from '../util/evm'

chai.use(solidity)

describe('Livepeer Integration Test', () => {
  // Mocks
  let LivepeerNoMock: ILivepeer
  let LivepeerMock: MockContract
  let UniswapRouterMock: MockContract
  let WethMock: MockContract

  // Deployment
  let Livepeer: {[name: string]: Deployment}

  const protocolFeesPercent = ethers.utils.parseEther('0.025')
  const liquidityFeesPercent = ethers.utils.parseEther('0.025')

  before('get signers', async function () {
    const namedAccs = await hre.getNamedAccounts()
    this.signers = await ethers.getSigners()

    this.deployer = namedAccs.deployer
  })

  before('deploy Livepeer token (Steak)', async function () {
    const SimpleTokenFactory = await ethers.getContractFactory(
      'SimpleToken',
      this.signers[0]
    )
    this.Steak = (await SimpleTokenFactory.deploy('Livepeer Token', 'LPT', ethers.utils.parseEther('1000000'))) as SimpleToken
  })

  before('deploy Livepeer', async function () {
    const LivepeerFac = await ethers.getContractFactory(
      'LivepeerMock',
      this.signers[0]
    )

    LivepeerNoMock = (await LivepeerFac.deploy(this.Steak.address)) as ILivepeer
    this.StakingContractNoMock = LivepeerNoMock

    LivepeerMock = await smockit(LivepeerNoMock)
  })

  before('deploy Uniswap Router Mock', async function () {
    const UniswapRouterFac = await ethers.getContractFactory(
      'UniswapRouterMock',
      this.signers[0]
    )

    const UniswapRouterNoMock = (await UniswapRouterFac.deploy()) as ISwapRouterWithWETH

    UniswapRouterMock = await smockit(UniswapRouterNoMock)
  })

  before('deploy WETH Mock', async function () {
    const WETHFac = await ethers.getContractFactory(
      'WETHMock',
      this.signers[0]
    )

    const WETHNoMock = (await WETHFac.deploy()) as IWETH

    WethMock = await smockit(WETHNoMock)
  })

  before('deploy Livepeer Tenderizer', async function () {
    const STEAK_AMOUNT = '100000'
    this.NODE = '0xf4e8Ef0763BCB2B1aF693F5970a00050a6aC7E1B'

    process.env.NAME = 'Livepeer'
    process.env.SYMBOL = 'LPT'
    process.env.CONTRACT = LivepeerMock.address
    process.env.TOKEN = this.Steak.address
    process.env.VALIDATOR = this.NODE
    process.env.STEAK_AMOUNT = STEAK_AMOUNT

    this.NAME = process.env.NAME
    this.initialStake = ethers.utils.parseEther(STEAK_AMOUNT).div('2')
    this.deposit = ethers.utils.parseEther('100')
    // For porotocols where there is a tax to stake
    this.DELEGATION_TAX = BigNumber.from(0)
    this.MAX_PPM = BigNumber.from(1000000)

    this.lockID = 0

    Livepeer = await hre.deployments.fixture(['Livepeer'], {
      keepExistingDeployments: false
    })
    this.Controller = ((await ethers.getContractAt('Controller', Livepeer.Controller.address)) as Controller)
    this.Tenderizer = (await ethers.getContractAt('Livepeer', Livepeer.Livepeer_Proxy.address)) as Livepeer
    this.TenderizerImpl = (await ethers.getContractAt('Livepeer', Livepeer.Livepeer_Implementation.address)) as Livepeer
    this.TenderToken = (await ethers.getContractAt('TenderToken', Livepeer.TenderToken.address)) as TenderToken
    this.TenderSwap = (await ethers.getContractAt('TenderSwap', await this.Controller.tenderSwap())) as TenderSwap
    this.TenderFarm = (await ethers.getContractAt('TenderFarm', Livepeer.TenderFarm.address)) as TenderFarm
    this.LpToken = (await ethers.getContractAt('LiquidityPoolToken', await this.TenderSwap.lpToken())) as LiquidityPoolToken
    UniswapRouterMock.smocked.WETH9.will.return.with(WethMock.address)
    await this.Controller.batchExecute(
      [this.Tenderizer.address, this.Tenderizer.address, this.Tenderizer.address],
      [0, 0, 0],
      [this.Tenderizer.interface.encodeFunctionData('setProtocolFee', [protocolFeesPercent]),
        this.Tenderizer.interface.encodeFunctionData('setLiquidityFee', [liquidityFeesPercent]),
        this.Tenderizer.interface.encodeFunctionData('setUniswapRouter', [UniswapRouterMock.address])]
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
    this.stakeMock.function = LivepeerMock.smocked.bond
    // TODO: Use name everywhere and just pass entire LivepeerMock.smocked
    this.stakeMock.functionName = 'bond'
    this.stakeMock.nodeParam = '_to'
    this.stakeMock.amountParam = '_amount'

    this.withdrawRewardsMock = LivepeerMock.smocked.withdrawFees

    this.unbondMock = {}
    this.unbondMock.function = LivepeerMock.smocked.unbond
    this.unbondMock.amountParam = '_amount'

    this.withdrawMock = {}
    this.withdrawMock.function = LivepeerMock.smocked.withdrawStake
  })

  // Run tests
  describe('Deposit', depositTests.bind(this))
  describe('Stake', stakeTests.bind(this))

  const swappedLPTRewards = ethers.BigNumber.from('100000000')
  let liquidityFees: BigNumber
  let protocolFees: BigNumber
  let newStake: BigNumber
  describe('Rebases', async function () {
    context('Positive Rebase', async function () {
      before(async function () {
        this.increase = ethers.BigNumber.from('10000000000')
        liquidityFees = percOf2(this.increase.add(swappedLPTRewards), liquidityFeesPercent)
        protocolFees = percOf2(this.increase.add(swappedLPTRewards), protocolFeesPercent)
        newStake = this.deposit.add(this.initialStake).add(this.increase)
        this.newStakeMinusFees = newStake.add(swappedLPTRewards).sub(liquidityFees.add(protocolFees))
        this.increase = this.increase.add(swappedLPTRewards)
        LivepeerMock.smocked.pendingStake.will.return.with(newStake)
        LivepeerMock.smocked.pendingFees.will.return.with(ethers.utils.parseEther('0.1'))
        WethMock.smocked.deposit.will.return()
        WethMock.smocked.approve.will.return.with(true)
        UniswapRouterMock.smocked.exactInputSingle.will.return.with(swappedLPTRewards)
      })
      describe('Stake increases', stakeIncreaseTests.bind(this))
    })

    context('Neutral Rebase', async function () {
      before(async function () {
        this.stakeMinusFees = newStake.add(swappedLPTRewards).sub(liquidityFees.add(protocolFees))
        LivepeerMock.smocked.pendingStake.will.return.with(newStake.add(swappedLPTRewards))
        LivepeerMock.smocked.pendingFees.will.return.with(ethers.constants.Zero)
      })
      describe('Stake stays the same', stakeStaysSameTests.bind(this))
    })

    context('Negative Rebase', async function () {
      before(async function () {
        const reducedStake = this.deposit.add(this.initialStake)
        const oldStake = this.deposit.add(this.initialStake).add(swappedLPTRewards)
        this.expectedCP = oldStake.sub(liquidityFees).sub(protocolFees)
        LivepeerMock.smocked.pendingStake.will.return.with(reducedStake.add(swappedLPTRewards))
        LivepeerMock.smocked.pendingFees.will.return.with(ethers.constants.AddressZero)
      })
      describe('Stake decreases', stakeDecreaseTests.bind(this))
    })
  })

  describe('Collect fees', protocolFeeTests.bind(this))
  describe('Collect Liquidity fees', liquidityFeeTests.bind(this))
  describe('Swap', swapTests.bind(this))
  describe('Unlock and Withdraw', async function () {
    describe('User unlock', userBasedUnlockByUser.bind(this))
    describe('Gov unlock', async function () {
      context('Zero stake', async function () {
        before(async function () {
          LivepeerMock.smocked.pendingStake.will.return.with(ethers.constants.Zero)
        })
        describe('No pending stake', govUnbondRevertIfNoStake.bind(this))
      })
      context('>0 Stake', async function () {
        before(async function () {
          LivepeerMock.smocked.pendingStake.will.return
            .with(await this.Tenderizer.totalStakedTokens())
        })
        describe('Gov unlocks', userBasedUnlockByGov.bind(this))
      })
    })
    describe('Withdraw', userBasedWithdrawalTests.bind(this))
  })
  describe('Upgrades', upgradeTests.bind(this))
  describe('Setting contract variables', setterTests.bind(this))
})
