import hre, { ethers } from 'hardhat'

import { MockContract, smockit } from '@eth-optimism/smock'

import {
  SimpleToken, TenderToken, Livepeer, ISwapRouterWithWETH, IWETH, TenderFarm, TenderSwap, LiquidityPoolToken, LivepeerMock
} from '../../typechain/'

import chai from 'chai'
import {
  solidity
} from 'ethereum-waffle'
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
  let LivepeerMock: LivepeerMock
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

    LivepeerMock = (await LivepeerFac.deploy(this.Steak.address)) as LivepeerMock
    this.StakingContract = LivepeerMock
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

    this.methods = {
      stake: 'bond',
      unstake: 'unbond',
      withdrawStake: 'withdrawStake'
    }

    this.NAME = process.env.NAME
    this.SYMBOL = process.env.SYMBOL
    this.initialStake = ethers.utils.parseEther(STEAK_AMOUNT).div('2')
    this.deposit = ethers.utils.parseEther('100')
    // For porotocols where there is a tax to stake
    this.DELEGATION_TAX = BigNumber.from(0)
    this.MAX_PPM = BigNumber.from(1000000)

    this.lockID = 0

    Livepeer = await hre.deployments.fixture(['Livepeer'], {
      keepExistingDeployments: false
    })
    this.Tenderizer = (await ethers.getContractAt('Livepeer', Livepeer.Livepeer_Proxy.address)) as Livepeer
    this.TenderizerImpl = (await ethers.getContractAt('Livepeer', Livepeer.Livepeer_Implementation.address)) as Livepeer
    this.TenderToken = (await ethers.getContractAt('TenderToken', await this.Tenderizer.tenderToken())) as TenderToken
    this.TenderSwap = (await ethers.getContractAt('TenderSwap', await this.Tenderizer.tenderSwap())) as TenderSwap
    this.TenderFarm = (await ethers.getContractAt('TenderFarm', Livepeer.TenderFarm.address)) as TenderFarm
    this.LpToken = (await ethers.getContractAt('LiquidityPoolToken', await this.TenderSwap.lpToken())) as LiquidityPoolToken
    UniswapRouterMock.smocked.WETH9.will.return.with(WethMock.address)

    // Set contract variables
    await this.Tenderizer.setProtocolFee(protocolFeesPercent)
    await this.Tenderizer.setLiquidityFee(liquidityFeesPercent)
    await this.Tenderizer.setUniswapRouter(UniswapRouterMock.address)

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

  const swappedLPTRewards = ethers.utils.parseEther('10')
  let liquidityFees: BigNumber
  let protocolFees: BigNumber
  let newStake: BigNumber
  describe('Rebases', async function () {
    context('Positive Rebase', async function () {
      before(async function () {
        this.increase = ethers.utils.parseEther('90')
        liquidityFees = percOf2(this.increase.add(swappedLPTRewards), liquidityFeesPercent)
        protocolFees = percOf2(this.increase.add(swappedLPTRewards), protocolFeesPercent)
        newStake = this.deposit.add(this.initialStake).add(this.increase)
        this.newStakeMinusFees = newStake.add(swappedLPTRewards).sub(liquidityFees.add(protocolFees))

        // set increase on mock
        await this.StakingContract.setStaked(this.increase.add(await this.StakingContract.staked()))

        // With mock values set correctly, adjust increase with fees
        // for assertions
        this.increase = this.increase.add(swappedLPTRewards).sub(protocolFees.add(liquidityFees))

        // Set secondary rewards
        await this.StakingContract.setSecondaryRewards(swappedLPTRewards)
        WethMock.smocked.deposit.will.return()
        WethMock.smocked.approve.will.return.with(true)
        UniswapRouterMock.smocked.exactInputSingle.will.return.with(swappedLPTRewards)
      })
      describe('Stake increases', stakeIncreaseTests.bind(this))
    })

    context('Neutral Rebase', async function () {
      before(async function () {
        UniswapRouterMock.smocked.exactInputSingle.will.return.with(ethers.constants.Zero)
        this.stakeMinusFees = newStake.add(swappedLPTRewards).sub(liquidityFees.add(protocolFees))
      })
      describe('Stake stays the same', stakeStaysSameTests.bind(this))
    })

    context('Negative Rebase', async function () {
      before(async function () {
        const stake = await this.StakingContract.staked()
        this.decrease = ethers.utils.parseEther('10')
        // reduced stake is current stake - 90 from rewards previously
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
    describe('User unlock', userBasedUnlockByUser.bind(this))
    describe('Gov unlock', async function () {
      context('Zero stake', async function () {
        before(async function () {
          await this.StakingContract.setStaked(0)
        })
        describe('No pending stake', govUnbondRevertIfNoStake.bind(this))
      })
      context('>0 Stake', async function () {
        before(async function () {
          await this.StakingContract.setStaked(
            await this.Tenderizer.totalStakedTokens()
          )
        })
        describe('Gov unlocks', userBasedUnlockByGov.bind(this))
      })
    })
    describe('Withdraw', userBasedWithdrawalTests.bind(this))
  })
  describe('Upgrades', upgradeTests.bind(this))
  describe('Setting contract variables', setterTests.bind(this))
})
