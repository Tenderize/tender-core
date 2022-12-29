import hre, { ethers } from 'hardhat'
import * as rpc from '../util/snapshot'
import { MockContract, smock } from '@defi-wonderland/smock'

import {
  SimpleToken, TenderToken, Livepeer, TenderFarm, TenderSwap, LiquidityPoolToken, LivepeerMock, WETHMock__factory, UniswapRouterMock__factory, UniswapRouterMock, WETHMock, LivepeerMock__factory
} from '../../typechain/'

import chai from 'chai'
import {
  solidity
} from 'ethereum-waffle'
import { Deployment } from 'hardhat-deploy/dist/types'
import { BigNumber } from '@ethersproject/bignumber'

import beforeInitialDepsoits from './behaviors/beforeInitialDeposits.behavior'
import addInitialDeposits from './behaviors/addInitialDeposits'
import initialStateTests from './behaviors/initialState.behavior'
import depositTests from './behaviors/deposit.behavior'
import stakeTests from './behaviors/stake.behavior'
import {
  stakeIncreaseTests,
  stakeStaysSameTests,
  stakeDecreaseTests
} from './behaviors/rebase.behavior'
import swapTests from './behaviors/swap.behavior'
import {
  userBasedUnlockByUser,
  rescueFunctions
} from './behaviors/userBasedUnlock.behavior'
import userBasedWithdrawalTests from './behaviors/userBasedWithdrawal.behavior'
import upgradeTests from './behaviors/upgrade.behavior'
import setterTests from './behaviors/setters.behavior'
import { percOf2 } from '../util/helpers'

chai.use(solidity)

describe('Livepeer Integration Test', () => {
  let snapshotId: any
  // Mocks
  let LivepeerMock: MockContract<LivepeerMock>
  let UniswapRouterMock: MockContract<UniswapRouterMock>
  let WethMock: MockContract<WETHMock>

  // Deployment
  let Livepeer: { [name: string]: Deployment }

  const protocolFeesPercent = ethers.utils.parseEther('50')
  const liquidityFeesPercent = ethers.utils.parseEther('50')

  beforeEach(async () => {
    snapshotId = await rpc.snapshot()
  })

  afterEach(async () => {
    await rpc.revert(snapshotId)
  })

  beforeEach('get signers', async function () {
    const namedAccs = await hre.getNamedAccounts()
    this.signers = await ethers.getSigners()

    this.deployer = namedAccs.deployer
  })

  beforeEach('deploy Livepeer token (Steak)', async function () {
    const SimpleTokenFactory = await ethers.getContractFactory(
      'SimpleToken',
      this.signers[0]
    )
    this.Steak = (await SimpleTokenFactory.deploy('Livepeer Token', 'LPT', ethers.utils.parseEther('1000000'))) as SimpleToken
  })

  beforeEach('deploy Livepeer', async function () {
    const LivepeerFac = await smock.mock<LivepeerMock__factory>('LivepeerMock')
    LivepeerMock = await LivepeerFac.deploy(this.Steak.address)
    this.StakingContract = LivepeerMock
  })

  beforeEach('deploy Uniswap Router Mock', async function () {
    const UniswapRouterFac = await smock.mock<UniswapRouterMock__factory>('UniswapRouterMock')
    UniswapRouterMock = await UniswapRouterFac.deploy()
  })

  beforeEach('deploy WETH Mock', async function () {
    const WETHFac = await smock.mock<WETHMock__factory>('WETHMock')
    WethMock = await WETHFac.deploy()
  })

  beforeEach('deploy Livepeer Tenderizer', async function () {
    const STEAK_AMOUNT = '100000'
    this.NODE = '0xf4e8Ef0763BCB2B1aF693F5970a00050a6aC7E1B'

    process.env.NAME = 'Livepeer'
    process.env.SYMBOL = 'LPT'
    process.env.CONTRACT = LivepeerMock.address
    process.env.TOKEN = this.Steak.address
    process.env.VALIDATOR = this.NODE
    process.env.STEAK_AMOUNT = STEAK_AMOUNT
    process.env.ADMIN_FEE = '0'
    process.env.SWAP_FEE = '5000000'
    process.env.AMPLIFIER = '85'

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
    this.TenderFarm = (await ethers.getContractAt('TenderFarm', await this.Tenderizer.tenderFarm())) as TenderFarm
    this.LpToken = (await ethers.getContractAt('LiquidityPoolToken', await this.TenderSwap.lpToken())) as LiquidityPoolToken
    UniswapRouterMock.WETH9.returns(WethMock.address)

    // Set contract variables
    await this.Tenderizer.setProtocolFee(protocolFeesPercent)
    await this.Tenderizer.setLiquidityFee(liquidityFeesPercent)
    await this.Tenderizer.setUniswapRouter(UniswapRouterMock.address)
  })

  // Run tests
  describe('Before intial deposits', beforeInitialDepsoits.bind(this))

  describe('After initial deposits', async function () {
    beforeEach(async function () {
      await addInitialDeposits(this)
    })

    describe('Initial State', initialStateTests.bind(this))
    describe('Deposit', depositTests.bind(this))
    describe('Stake', stakeTests.bind(this))

    const swappedLPTRewards = ethers.utils.parseEther('10')
    describe('Rebases', async function () {
      context('Positive Rebase', async function () {
        beforeEach(async function () {
          this.increase = ethers.utils.parseEther('90')
          this.liquidityFees = percOf2(this.increase.add(swappedLPTRewards), liquidityFeesPercent)
          this.protocolFees = percOf2(this.increase.add(swappedLPTRewards), protocolFeesPercent)
          this.newStake = this.initialStake.add(this.increase).add(swappedLPTRewards)

          // set increase on mock
          await this.StakingContract.setStaked(this.increase.add(await this.StakingContract.staked()))

          // With mock values set correctly, adjust increase with fees
          // for assertions
          this.increase = this.increase.add(swappedLPTRewards)

          // Set secondary rewards
          await this.StakingContract.setSecondaryRewards(swappedLPTRewards)
          WethMock.deposit.returns()
          WethMock.approve.returns(true)
          UniswapRouterMock.exactInputSingle.returns(swappedLPTRewards)
        })
        describe('Stake increases', stakeIncreaseTests.bind(this))
      })

      context('Neutral Rebase', async function () {
        beforeEach(async function () {
          await this.Tenderizer.claimRewards()
          UniswapRouterMock.exactInputSingle.returns(ethers.constants.Zero)
          this.expectedCP = this.initialStake
        })
        describe('Stake stays the same', stakeStaysSameTests.bind(this))
      })

      context('Negative Rebase', async function () {
        beforeEach(async function () {
          await this.Tenderizer.claimRewards()
          this.decrease = ethers.utils.parseEther('10')
          this.expectedCP = this.initialStake.sub(this.decrease)
          // reduce staked on mock
          await this.StakingContract.setStaked((await this.StakingContract.staked()).sub(this.decrease))
        })
        describe('Stake decreases', stakeDecreaseTests.bind(this))
      })
    })

    describe('Swap', swapTests.bind(this))

    describe('Unlock and Withdrawal', async function () {
      describe('User unlock', userBasedUnlockByUser.bind(this))
      describe('Withdrawal', userBasedWithdrawalTests.bind(this))
    })
    describe('Rescue Functions', rescueFunctions.bind(this))
    describe('Upgrades', upgradeTests.bind(this))
    describe('Setting contract variables', setterTests.bind(this))
  })
})
