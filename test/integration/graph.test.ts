import hre, { ethers } from 'hardhat'

import {
  SimpleToken, Tenderizer, TenderToken, TenderFarm, TenderSwap, LiquidityPoolToken, GraphMock
} from '../../typechain'

import { percOf2 } from '../util/helpers'

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
import {
  protocolFeeTests,
  liquidityFeeTests
} from './behaviors/fees.behavior'
import swapTests from './behaviors/swap.behavior'
import unlockTests from './behaviors/govBasedUnlock.behavior'
import withdrawTests from './behaviors/govBasedWithdrawal.behavior'
import upgradeTests from './behaviors/upgrade.behavior'
import setterTests from './behaviors/setters.behavior'

chai.use(solidity)

describe('Graph Integration Test', () => {
  let GraphMock: GraphMock

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

    GraphMock = (await GraphFac.deploy(this.Steak.address)) as GraphMock
    this.StakingContract = GraphMock
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

    this.methods = {
      stake: 'delegate',
      unstake: 'undelegate',
      withdrawStake: 'withdrawDelegated'
    }

    this.NAME = process.env.NAME
    this.SYMBOL = process.env.SYMBOL
    this.initialStake = ethers.utils.parseEther(STEAK_AMOUNT).div('2')
    this.deposit = ethers.utils.parseEther('100')

    this.unbondLockID = 0
    this.govUnboundLockID = 1
    // For porotocols where there is a tax to stake
    this.DELEGATION_TAX = BigNumber.from(5000)
    this.MAX_PPM = BigNumber.from(1000000)

    Graph = await hre.deployments.fixture(['Graph'], {
      keepExistingDeployments: false
    })
    this.Tenderizer = (await ethers.getContractAt('Tenderizer', Graph.Graph.address)) as Tenderizer
    this.TenderizerImpl = (await ethers.getContractAt('Tenderizer', Graph.Graph_Implementation.address)) as Tenderizer
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
    before(async function () {
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
        before(async function () {
          this.increase = ethers.utils.parseEther('10')
          liquidityFees = percOf2(this.increase, liquidityFeesPercent)
          protocolFees = percOf2(this.increase, protocolFeesPercent)
          newStake = this.deposit.add(this.initialStake)
            .sub(this.deposit.add(this.initialStake).mul(this.DELEGATION_TAX).div(this.MAX_PPM))
            .add(this.increase)
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
})
