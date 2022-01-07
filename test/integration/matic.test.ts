import hre, { ethers } from 'hardhat'
import * as rpc from '../util/snapshot'
import {
  SimpleToken, Tenderizer, TenderToken, TenderFarm, TenderSwap, LiquidityPoolToken, MaticMock
} from '../../typechain'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { Deployment } from 'hardhat-deploy/dist/types'
import { BigNumber } from '@ethersproject/bignumber'
import { percOf2 } from '../util/helpers'

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

chai.use(solidity)

describe('Matic Integration Test', () => {
  let snapshotId: any
  let MaticMock: MaticMock

  let Matic: {[name: string]: Deployment}

  const protocolFeesPercent = ethers.utils.parseEther('0.025')
  const liquidityFeesPercent = ethers.utils.parseEther('0.025')

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

  beforeEach('deploy Matic token', async function () {
    const SimpleTokenFactory = await ethers.getContractFactory(
      'SimpleToken',
      this.signers[0]
    )

    this.Steak = (await SimpleTokenFactory.deploy('Matic Token', 'MATIC', ethers.utils.parseEther('1000000'))) as SimpleToken
  })

  beforeEach('deploy Matic', async function () {
    const MaticFac = await ethers.getContractFactory(
      'MaticMock',
      this.signers[0]
    )

    MaticMock = (await MaticFac.deploy(this.Steak.address)) as MaticMock
    this.StakingContract = MaticMock

    this.NODE = MaticMock.address
  })

  beforeEach('deploy Matic Tenderizer', async function () {
    const STEAK_AMOUNT = '100000'
    process.env.NAME = 'Matic'
    process.env.SYMBOL = 'MATIC'
    process.env.VALIDATOR = MaticMock.address
    process.env.TOKEN = this.Steak.address
    process.env.CONTRACT = MaticMock.address
    process.env.STEAK_AMOUNT = STEAK_AMOUNT

    this.methods = {
      stake: 'buyVoucher',
      unstake: 'sellVoucher_new',
      withdrawStake: 'unstakeClaimTokens_new'
    }

    this.NAME = process.env.NAME
    this.SYMBOL = process.env.SYMBOL
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
    this.TenderFarm = (await ethers.getContractAt('TenderFarm', await this.Tenderizer.tenderFarm())) as TenderFarm
    this.LpToken = (await ethers.getContractAt('LiquidityPoolToken', await this.TenderSwap.lpToken())) as LiquidityPoolToken

    // Set contract variables
    await this.Tenderizer.setProtocolFee(protocolFeesPercent)
    await this.Tenderizer.setLiquidityFee(liquidityFeesPercent)

    // Matic specific stuff
    this.exchangeRatePrecision = 100
    this.fxRate = 100
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

    let liquidityFees: BigNumber
    let protocolFees: BigNumber
    let newStake: BigNumber
    describe('Rebases', async function () {
      context('Positive Rebase', async function () {
        beforeEach(async function () {
          this.increase = ethers.utils.parseEther('10')
          liquidityFees = percOf2(this.increase, liquidityFeesPercent)
          protocolFees = percOf2(this.increase, protocolFeesPercent)
          newStake = this.initialStake.add(this.increase)
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
        beforeEach(async function () {
          await this.Tenderizer.claimRewards()
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

    describe('Collect fees', protocolFeeTests.bind(this))
    describe('Collect Liquidity fees', liquidityFeeTests.bind(this))
    describe('Swap', swapTests.bind(this))
    describe('Unlock and Withdraw', async function () {
      describe('User unlock', userBasedUnlockByUser.bind(this))
      describe('Withdrawal', userBasedWithdrawalTests.bind(this))
      describe('Gov unlock', async function () {
        context('Zero stake', async function () {
          beforeEach(async function () {
            await this.StakingContract.setStaked(0)
          })
          describe('No pending stake', govUnbondRevertIfNoStake.bind(this))
        })
        context('>0 Stake', async function () {
          beforeEach(async function () {
            await this.StakingContract.setStaked(
              await this.Tenderizer.totalStakedTokens()
            )
          })
          describe('Gov unlocks', userBasedUnlockByGov.bind(this))
        })
      })
    })
    describe('Upgrades', upgradeTests.bind(this))
    describe('Setting contract variables', setterTests.bind(this))
  })
})
