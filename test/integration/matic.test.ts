import hre, { ethers } from 'hardhat'
import { MockContract, smockit } from '@eth-optimism/smock'
import {
  SimpleToken, Tenderizer, TenderToken, IMatic, TenderFarm, TenderSwap, LiquidityPoolToken
} from '../../typechain'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { Deployment } from 'hardhat-deploy/dist/types'
import { BigNumber } from '@ethersproject/bignumber'
import { percOf2 } from '../util/helpers'

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

import { getCurrentBlockTimestamp } from '../util/evm'

chai.use(solidity)

describe('Matic Integration Test', () => {
  let MaticNoMock: IMatic
  let MaticMock: MockContract

  let Matic: {[name: string]: Deployment}

  const protocolFeesPercent = ethers.utils.parseEther('0.025')
  const liquidityFeesPercent = ethers.utils.parseEther('0.025')

  before('get signers', async function () {
    const namedAccs = await hre.getNamedAccounts()
    this.signers = await ethers.getSigners()

    this.deployer = namedAccs.deployer
  })

  before('deploy Matic token', async function () {
    const SimpleTokenFactory = await ethers.getContractFactory(
      'SimpleToken',
      this.signers[0]
    )

    this.Steak = (await SimpleTokenFactory.deploy('Matic Token', 'MATIC', ethers.utils.parseEther('1000000'))) as SimpleToken
  })

  before('deploy Matic', async function () {
    const MaticFac = await ethers.getContractFactory(
      'MaticMock',
      this.signers[0]
    )

    MaticNoMock = (await MaticFac.deploy(this.Steak.address)) as IMatic
    this.StakingContractNoMock = MaticNoMock
    MaticMock = await smockit(MaticNoMock)

    this.NODE = MaticMock.address
  })

  before('deploy Matic Tenderizer', async function () {
    const STEAK_AMOUNT = '100000'
    process.env.NAME = 'Matic'
    process.env.SYMBOL = 'MATIC'
    process.env.VALIDATOR = MaticMock.address
    process.env.TOKEN = this.Steak.address
    process.env.CONTRACT = '0x0000000000000000000000000000000000000101' // dummy
    process.env.STEAK_AMOUNT = STEAK_AMOUNT

    this.NAME = process.env.NAME
    this.initialStake = ethers.utils.parseEther(STEAK_AMOUNT).div('2')
    this.deposit = ethers.utils.parseEther('100')
    // For porotocols where there is a tax to stake
    this.DELEGATION_TAX = BigNumber.from(0)
    this.MAX_PPM = BigNumber.from(1000000)

    this.lockID = 0

    Matic = await hre.deployments.fixture(['Matic'], {
      keepExistingDeployments: false
    })
    this.Tenderizer = (await ethers.getContractAt('Tenderizer', Matic.Matic.address)) as Tenderizer
    this.TenderizerImpl = (await ethers.getContractAt('Tenderizer', Matic.Matic_Implementation.address)) as Tenderizer
    this.TenderToken = (await ethers.getContractAt('TenderToken', await this.Tenderizer.tenderToken())) as TenderToken
    this.TenderSwap = (await ethers.getContractAt('TenderSwap', await this.Tenderizer.tenderSwap())) as TenderSwap
    this.TenderFarm = (await ethers.getContractAt('TenderFarm', Matic.TenderFarm.address)) as TenderFarm
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

    // Setup Mocks for assertions
    // Note: Mocks not needed for assertions can be set in before hooks here
    this.stakeMock = {}
    this.stakeMock.function = MaticMock.smocked.buyVoucher
    // TODO: Use name everywhere and just pass entire LivepeerMock.smocked
    this.stakeMock.functionName = 'buyVoucher'
    this.stakeMock.amountParam = '_amount'

    this.withdrawRewardsMock = null

    this.unbondMock = {}
    this.unbondMock.function = MaticMock.smocked.sellVoucher_new
    this.unbondMock.amountParam = '_claimAmount'

    this.withdrawMock = {}
    this.withdrawMock.function = MaticMock.smocked.unstakeClaimTokens_new

    // Matic specific stuff
    this.exchangeRatePrecision = 100
    this.fxRate = 100
    MaticMock.smocked.validatorId.will.return.with(1)
    MaticMock.smocked.exchangeRate.will.return.with(this.fxRate)
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
        MaticMock.smocked.balanceOf.will.return.with(newStake)
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
        this.expectedCP = reducedStake.sub(liquidityFees).sub(protocolFees)
        MaticMock.smocked.balanceOf.will.return.with(reducedStake)
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
          MaticMock.smocked.balanceOf.will.return.with(ethers.constants.Zero)
        })
        describe('No pending stake', govUnbondRevertIfNoStake.bind(this))
      })
      context('>0 Stake', async function () {
        before(async function () {
          MaticMock.smocked.balanceOf.will.return
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
