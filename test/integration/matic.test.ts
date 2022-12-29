import hre, { ethers } from 'hardhat'
import * as rpc from '../util/snapshot'
import { MockContract, smock } from '@defi-wonderland/smock'

import {
  SimpleToken, Matic, TenderToken, TenderFarm, TenderSwap, LiquidityPoolToken, MaticMock, MaticMock__factory
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
import swapTests from './behaviors/swap.behavior'
import {
  userBasedUnlockByUser,
  rescueFunctions
} from './behaviors/userBasedUnlock.behavior'
import userBasedWithdrawalTests from './behaviors/userBasedWithdrawal.behavior'
import upgradeTests from './behaviors/upgrade.behavior'
import setterTests from './behaviors/setters.behavior'

chai.use(solidity)

describe('Matic Integration Test', () => {
  let snapshotId: any
  let MaticMock: MockContract<MaticMock>

  let Matic: { [name: string]: Deployment }

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

  beforeEach('deploy Matic token', async function () {
    const SimpleTokenFactory = await ethers.getContractFactory(
      'SimpleToken',
      this.signers[0]
    )

    this.Steak = (await SimpleTokenFactory.deploy('Matic Token', 'MATIC', ethers.utils.parseEther('1000000'))) as SimpleToken
  })

  beforeEach('deploy Matic', async function () {
    const MaticFac = await smock.mock<MaticMock__factory>('MaticMock')

    MaticMock = await MaticFac.deploy(this.Steak.address)
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
    process.env.ADMIN_FEE = '0'
    process.env.SWAP_FEE = '5000000'
    process.env.AMPLIFIER = '85'

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
    this.Tenderizer = (await ethers.getContractAt('Matic', Matic.Matic.address)) as Matic
    this.TenderizerImpl = (await ethers.getContractAt('Matic', Matic.Matic_Implementation.address)) as Matic
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
    let newStake: BigNumber
    describe('Rebases', async function () {
      context('Positive Rebase', async function () {
        beforeEach(async function () {
          this.increase = ethers.utils.parseEther('10')
          this.liquidityFees = percOf2(this.increase, liquidityFeesPercent)
          this.protocolFees = percOf2(this.increase, protocolFeesPercent)
          newStake = this.initialStake.add(this.increase)
          this.newStake = newStake

          // set increase on mock
          await this.StakingContract.setStaked(this.increase.add(await this.StakingContract.staked()))
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

    describe('Swap', swapTests.bind(this))
    describe('Unlock and Withdraw', async function () {
      describe('User unlock', userBasedUnlockByUser.bind(this))
      describe('Withdrawal', userBasedWithdrawalTests.bind(this))
    })
    describe('Rescue Functions', rescueFunctions.bind(this))
    describe('Upgrades', upgradeTests.bind(this))
    describe('Setting contract variables', setterTests.bind(this))
  })
})
