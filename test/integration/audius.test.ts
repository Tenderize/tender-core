import hre, { ethers } from 'hardhat'
import * as rpc from '../util/snapshot'
import {
  SimpleToken, TenderToken, AudiusMock, TenderFarm, TenderSwap, LiquidityPoolToken, Audius
} from '../../typechain'
import { percOf2 } from '../util/helpers'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
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
  govBasedUnlock,
  rescueFunctions
} from './behaviors/govBasedUnlock.behavior'
import withdrawTests from './behaviors/govBasedWithdrawal.behavior'
import upgradeTests from './behaviors/upgrade.behavior'
import setterTests from './behaviors/setters.behavior'

chai.use(solidity)

describe('Audius Integration Test', () => {
  let snapshotId: any
  let AudiusMock: AudiusMock

  let Audius: {[name: string]: Deployment}

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

  beforeEach('deploy Audius token', async function () {
    const SimpleTokenFactory = await ethers.getContractFactory(
      'SimpleToken',
      this.signers[0]
    )

    this.Steak = (await SimpleTokenFactory.deploy('Audius Token', 'AUDIO', ethers.utils.parseEther('1000000'))) as SimpleToken
  })

  beforeEach('deploy Audius', async function () {
    const AudiusFac = await ethers.getContractFactory(
      'AudiusMock',
      this.signers[0]
    )

    AudiusMock = (await AudiusFac.deploy(this.Steak.address)) as AudiusMock
    this.StakingContract = AudiusMock
  })

  const STEAK_AMOUNT = '100000'

  beforeEach('deploy Audius Tenderizer', async function () {
    this.NODE = '0xf4e8Ef0763BCB2B1aF693F5970a00050a6aC7E1B'
    process.env.NAME = 'Audius'
    process.env.SYMBOL = 'AUDIO'
    process.env.CONTRACT = AudiusMock.address
    process.env.TOKEN = this.Steak.address
    process.env.VALIDATOR = this.NODE
    process.env.STEAK_AMOUNT = STEAK_AMOUNT
    process.env.ADMIN_FEE = '0'
    process.env.SWAP_FEE = '5000000'
    process.env.AMPLIFIER = '85'

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
    this.Tenderizer = (await ethers.getContractAt('Audius', Audius.Audius.address)) as Audius
    this.TenderizerImpl = (await ethers.getContractAt('Audius', Audius.Audius_Implementation.address)) as Audius
    this.TenderToken = (await ethers.getContractAt('TenderToken', await this.Tenderizer.tenderToken())) as TenderToken
    this.TenderSwap = (await ethers.getContractAt('TenderSwap', await this.Tenderizer.tenderSwap())) as TenderSwap
    this.TenderFarm = (await ethers.getContractAt('TenderFarm', await this.Tenderizer.tenderFarm())) as TenderFarm
    this.LpToken = (await ethers.getContractAt('LiquidityPoolToken', await this.TenderSwap.lpToken())) as LiquidityPoolToken

    // Set contract variables
    await this.Tenderizer.setProtocolFee(protocolFeesPercent)
    await this.Tenderizer.setLiquidityFee(liquidityFeesPercent)
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
      beforeEach(async function () {
        this.withdrawAmount = await this.TenderToken.balanceOf(this.deployer)
        await this.StakingContract.setStaked(
          await this.Tenderizer.totalStakedTokens()
        )
      })
      describe('Unstake', govBasedUnlock.bind(this))
      describe('Withdrawal', withdrawTests.bind(this))
    })
    describe('Rescue Functions', rescueFunctions.bind(this))
    describe('Upgrades', upgradeTests.bind(this))
    describe('Setting contract variables', setterTests.bind(this))
  })
})
