import {
  ethers, upgrades
} from 'hardhat'
import ethersTypes, { constants } from 'ethers'
import chai from 'chai'
import {
  solidity
} from 'ethereum-waffle'

import * as rpc from '../util/snapshot'

import { MockContract, smockit } from '@eth-optimism/smock'

import { percOf } from '../util/helpers'
import { SimpleToken, TenderFarm, TenderToken } from '../../typechain'
import { PERC_DIVISOR } from '../util/constants'
chai.use(solidity)
const {
  expect
} = chai

describe('TenderFarm', () => {
  let snapshotId: any

  let tenderToken: TenderToken
  let lpToken : SimpleToken
  let tenderFarm: any
  let tenderizerMock: MockContract

  let signers: ethersTypes.Signer[]

  let account0: string
  let account1: string
  let account2: string

  beforeEach(async () => {
    snapshotId = await rpc.snapshot()
  })

  afterEach(async () => {
    await rpc.revert(snapshotId)
  })

  beforeEach('Deploy TenderFarm', async () => {
    // 1
    signers = await ethers.getSigners()
    // 2
    const TenderizerFactory = await ethers.getContractFactory(
      'Livepeer',
      signers[0]
    )

    const tenderizer = (await TenderizerFactory.deploy())
    tenderizerMock = await smockit(tenderizer)

    const TenderTokenFactory = await ethers.getContractFactory(
      'TenderToken',
      signers[0]
    )

    const LPTokenFactory = await ethers.getContractFactory(
      'SimpleToken',
      signers[0]
    )

    const TenderFarmFactory = await ethers.getContractFactory(
      'TenderFarm',
      signers[0]
    )

    account0 = await signers[0].getAddress()
    account1 = await signers[1].getAddress()
    account2 = await signers[2].getAddress()

    lpToken = (await LPTokenFactory.deploy('LP token', 'LP', ethers.utils.parseEther('1000000000000000'))) as SimpleToken
    tenderToken = (await TenderTokenFactory.deploy()) as TenderToken
    await lpToken.deployed()
    await tenderToken.deployed()
    await tenderToken.initialize('Tender Token', 'Tender', tenderizerMock.address)

    tenderFarm = await upgrades.deployProxy(TenderFarmFactory, [lpToken.address, tenderToken.address, account0])
    await tenderFarm.deployed()

    const tenderSupply = ethers.utils.parseEther('1000000000000000')
    await tenderToken.mint(account0, tenderSupply)
    tenderizerMock.smocked.totalStakedTokens.will.return.with(tenderSupply)
  })

  describe('Genesis', () => {
    it('has set staking token', async () => {
      expect(await tenderFarm.token()).to.eq(lpToken.address)
    })

    it('has set reward token', async () => {
      expect(await tenderFarm.rewardToken()).to.eq(tenderToken.address)
    })

    it('total stake is 0', async () => {
      expect(await tenderFarm.totalStake()).to.eq(0)
    })

    it('nextTotalStake is 0', async () => {
      expect(await tenderFarm.nextTotalStake()).to.eq(0)
    })

    it('CRF is 0', async () => {
      expect(await tenderFarm.CRF()).to.eq(0)
    })

    it('stakeOf account0 is 0', async () => {
      expect(await tenderFarm.stakeOf(account0)).to.eq(constants.Zero)
    })

    it('available rewards for account0 is 0', async () => {
      expect(await tenderFarm.availableRewards(account0)).to.eq(constants.Zero)
    })

    it('last CRF is 0', async () => {
      const stake = await tenderFarm.stakes(account0)
      expect(stake.stake).to.eq(0)
      expect(stake.lastCRF).to.eq(0)
    })
  })

  describe('Upgrade TenderFarm', () => {
    it('upgrades tenderFarm - nextTotalStake() remains the same', async () => {
      // Farm some amount
      const amount = ethers.utils.parseEther('100')
      await lpToken.approve(tenderFarm.address, amount)
      await tenderFarm.farm(amount)

      // Upgrade farm
      const newFac = await ethers.getContractFactory('TenderFarm', signers[0])
      tenderFarm = await upgrades.upgradeProxy(tenderFarm.address, newFac)

      expect(await tenderFarm.nextTotalStake()).to.equal(amount)
    })
  })

  describe('Farm', () => {
    it('Fails if insufficient LP token allowance', async () => {
      await expect(tenderFarm.farm(ethers.utils.parseEther('500'))).to.be.reverted
    })

    it('Farm deposits for msg.sender', async () => {
      const amount = ethers.utils.parseEther('100')
      await lpToken.approve(tenderFarm.address, amount)

      // Check event
      await expect(tenderFarm.farm(amount)).to.emit(tenderFarm, 'Farm').withArgs(
        account0, amount
      )

      // Check stake
      expect(await tenderFarm.stakeOf(account0)).to.eq(amount)
      const stake = await tenderFarm.stakes(account0)
      expect(stake.stake).to.eq(amount)
      expect(stake.lastCRF).to.eq(0)

      // Check total stake
      expect(await tenderFarm.totalStake()).to.eq(0)

      expect(await tenderFarm.nextTotalStake()).to.eq(amount)

      // Check rewards still 0
      expect(await tenderFarm.availableRewards(account0)).to.eq(0)
    })

    it('Farm for deposits for specified account', async () => {
      const amount = ethers.utils.parseEther('150')
      await lpToken.approve(tenderFarm.address, amount)

      // Check event
      await expect(tenderFarm.farmFor(account1, amount)).to.emit(tenderFarm, 'Farm').withArgs(
        account1, amount
      )

      // Check stake
      expect(await tenderFarm.stakeOf(account1)).to.eq(amount)
      const stake = await tenderFarm.stakes(account1)
      expect(stake.stake).to.eq(amount)
      expect(stake.lastCRF).to.eq(0)

      // Check total stake
      expect(await tenderFarm.totalStake()).to.eq(0)

      expect(await tenderFarm.nextTotalStake()).to.eq(amount)

      // Check rewards still 0
      expect(await tenderFarm.availableRewards(account1)).to.eq(0)
    })

    it('Farms and harvests when there are rewards', async () => {
      const rewardAmount = ethers.utils.parseEther('100')
      // stake for account 1
      const rewardsPaidBefore1 = await tenderToken.balanceOf(account1)
      const amount1 = ethers.utils.parseEther('100')
      await lpToken.approve(tenderFarm.address, amount1)

      // Check event
      await expect(tenderFarm.farmFor(account1, amount1)).to.emit(tenderFarm, 'Farm').withArgs(
        account1, amount1
      )

      // Check stake
      expect(await tenderFarm.stakeOf(account1)).to.eq(amount1)
      let stake = await tenderFarm.stakes(account1)
      expect(stake.stake).to.eq(amount1)
      expect(stake.lastCRF).to.eq(0)

      // Check total stake
      expect(await tenderFarm.totalStake()).to.eq(0)

      expect(await tenderFarm.nextTotalStake()).to.eq(amount1)

      // Check rewards still 0
      expect(await tenderFarm.availableRewards(account1)).to.eq(0)

      // Add rewards
      await tenderToken.approve(tenderFarm.address, rewardAmount)
      await tenderFarm.addRewards(rewardAmount)

      // Check available rewards for account 1
      expect(await tenderFarm.availableRewards(account1)).to.eq(ethers.utils.parseEther('100'))

      // Check total stake has been set to next total stake
      expect(await tenderFarm.totalStake()).to.eq(amount1)

      // Check CRF has been updated
      expect(await tenderFarm.CRF()).to.eq(percOf(PERC_DIVISOR, rewardAmount, amount1))

      // Stake for account 2
      const amount2 = ethers.utils.parseEther('150')
      await lpToken.approve(tenderFarm.address, amount2)

      // Check event
      await expect(tenderFarm.farmFor(account2, amount2)).to.emit(tenderFarm, 'Farm').withArgs(
        account2, amount2
      )

      // Check stake
      expect(await tenderFarm.stakeOf(account2)).to.eq(amount2)
      stake = await tenderFarm.stakes(account2)
      expect(stake.stake).to.eq(amount2)
      expect(stake.lastCRF).to.eq(percOf(PERC_DIVISOR, rewardAmount, amount1))

      // Check total stake
      expect(await tenderFarm.totalStake()).to.eq(amount1)

      expect(await tenderFarm.nextTotalStake()).to.eq(amount1.add(amount2))

      // Check rewards still 0
      expect(await tenderFarm.availableRewards(account2)).to.eq(0)

      // Farm more for account 1 , should harvest rewards and update state correctly
      const addAmount1 = ethers.utils.parseEther('50')
      await lpToken.approve(tenderFarm.address, addAmount1)

      // Check event
      const tx = await tenderFarm.farmFor(account1, addAmount1)
      expect(tx).to.emit(tenderFarm, 'Farm').withArgs(
        account1, addAmount1
      )

      expect(tx).to.emit(tenderFarm, 'Harvest').withArgs(
        account1,
        rewardAmount
      )

      // Check stake
      expect(await tenderFarm.stakeOf(account1)).to.eq(amount1.add(addAmount1))
      stake = await tenderFarm.stakes(account1)
      expect(stake.stake).to.eq(amount1.add(addAmount1))
      expect(stake.lastCRF).to.eq(percOf(PERC_DIVISOR, rewardAmount, amount1))

      // Check total stake
      expect(await tenderFarm.totalStake()).to.eq(amount1)

      expect(await tenderFarm.nextTotalStake()).to.eq(amount1.add(amount2).add(addAmount1))

      // Check available rewards to be 0 (have been harvested)
      expect(await tenderFarm.availableRewards(account2)).to.eq(0)

      // Check tenderToken balance increased
      expect((await tenderToken.balanceOf(account1)).sub(rewardsPaidBefore1)).to.eq(rewardAmount)
    })
  })

  describe('Unfarm', () => {
    it('reverts if amount exceeds stake', async () => {
      await expect(tenderFarm.unfarm(ethers.utils.parseEther('150'))).to.be.revertedWith('AMOUNT_EXCEEDS_STAKE')
    })

    it('reverts if transfer fails', async () => {
      const lpMock = await smockit(lpToken)
      const TenderFarmFactory = await ethers.getContractFactory(
        'TenderFarm',
        signers[0]
      )
      tenderFarm = (await TenderFarmFactory.deploy()) as TenderFarm
      await tenderFarm.initialize(lpMock.address, tenderToken.address, account0)

      // stake for an account
      lpMock.smocked.transferFrom.will.return.with(true)
      const amount = ethers.utils.parseEther('150')
      await lpToken.approve(tenderFarm.address, amount)
      await tenderFarm.farm(amount)

      lpMock.smocked.transfer.will.return.with(false)

      await expect(tenderFarm.unfarm(amount)).to.be.revertedWith('TRANSFER_FAIL')
    })

    it('Unfarm tokens fully, no rewards', async () => {
      // stake for an account
      const amount = ethers.utils.parseEther('150')
      await lpToken.approve(tenderFarm.address, amount)

      // Check event
      await expect(tenderFarm.farmFor(account1, amount)).to.emit(tenderFarm, 'Farm').withArgs(
        account1, amount
      )

      // Check stake
      expect(await tenderFarm.stakeOf(account1)).to.eq(amount)
      let stake = await tenderFarm.stakes(account1)
      expect(stake.stake).to.eq(amount)
      expect(stake.lastCRF).to.eq(0)

      // Check total stake
      expect(await tenderFarm.totalStake()).to.eq(0)

      expect(await tenderFarm.nextTotalStake()).to.eq(amount)

      // Check rewards still 0
      expect(await tenderFarm.availableRewards(account1)).to.eq(0)

      const tx = tenderFarm.connect(await ethers.getSigner(account1)).unfarm(amount)
      await expect(tx).to.emit(tenderFarm, 'Unfarm').withArgs(
        account1, amount
      )

      await expect(tx).to.not.emit(tenderFarm, 'Harvest')

      // Check stake
      expect(await tenderFarm.stakeOf(account1)).to.eq(0)
      stake = await tenderFarm.stakes(account1)
      expect(stake.stake).to.eq(0)
      expect(stake.lastCRF).to.eq(0)

      // Check total stake
      expect(await tenderFarm.totalStake()).to.eq(0)

      expect(await tenderFarm.nextTotalStake()).to.eq(0)
    })

    it('Unfarm tokens partially, no rewards', async () => {
      // stake for an account
      const amount = ethers.utils.parseEther('150')
      await lpToken.approve(tenderFarm.address, amount)

      // Check event
      await expect(tenderFarm.farmFor(account1, amount)).to.emit(tenderFarm, 'Farm').withArgs(
        account1, amount
      )

      // Check stake
      expect(await tenderFarm.stakeOf(account1)).to.eq(amount)
      let stake = await tenderFarm.stakes(account1)
      expect(stake.stake).to.eq(amount)
      expect(stake.lastCRF).to.eq(0)

      // Check total stake
      expect(await tenderFarm.totalStake()).to.eq(0)

      expect(await tenderFarm.nextTotalStake()).to.eq(amount)

      // Check rewards still 0
      expect(await tenderFarm.availableRewards(account1)).to.eq(0)

      const unfarmAmount = ethers.utils.parseEther('75')
      const tx = tenderFarm.connect(await ethers.getSigner(account1)).unfarm(unfarmAmount)
      await expect(tx).to.emit(tenderFarm, 'Unfarm').withArgs(
        account1, unfarmAmount
      )

      await expect(tx).to.not.emit(tenderFarm, 'Harvest')

      // Check stake
      expect(await tenderFarm.stakeOf(account1)).to.eq(amount.sub(unfarmAmount))
      stake = await tenderFarm.stakes(account1)
      expect(stake.stake).to.eq(amount.sub(unfarmAmount))
      expect(stake.lastCRF).to.eq(0)

      // Check total stake
      expect(await tenderFarm.totalStake()).to.eq(0)

      expect(await tenderFarm.nextTotalStake()).to.eq(amount.sub(unfarmAmount))
    })

    it('Unfarms tokens fully, harvest rewards', async () => {
      const rewardBalBefore = await tenderToken.balanceOf(account1)
      // stake for an account
      const amount = ethers.utils.parseEther('200')
      await lpToken.approve(tenderFarm.address, amount)

      // Check event
      await expect(tenderFarm.farmFor(account1, amount)).to.emit(tenderFarm, 'Farm').withArgs(
        account1, amount
      )

      // Check stake
      expect(await tenderFarm.stakeOf(account1)).to.eq(amount)
      let stake = await tenderFarm.stakes(account1)
      expect(stake.stake).to.eq(amount)
      expect(stake.lastCRF).to.eq(0)

      // Check total stake
      expect(await tenderFarm.totalStake()).to.eq(0)

      expect(await tenderFarm.nextTotalStake()).to.eq(amount)

      // Check rewards still 0
      expect(await tenderFarm.availableRewards(account1)).to.eq(0)

      // Add rewards
      const rewardAmount = ethers.utils.parseEther('100')
      await tenderToken.approve(tenderFarm.address, rewardAmount)
      await tenderFarm.addRewards(rewardAmount)

      const tx = await tenderFarm.connect(await ethers.getSigner(account1)).unfarm(amount)
      await expect(tx).to.emit(tenderFarm, 'Unfarm').withArgs(
        account1, amount
      )

      await expect(tx).to.emit(tenderFarm, 'Harvest').withArgs(account1, rewardAmount)

      // Check stake
      expect(await tenderFarm.stakeOf(account1)).to.eq(0)
      stake = await tenderFarm.stakes(account1)
      expect(stake.stake).to.eq(0)
      expect(stake.lastCRF).to.eq(percOf(PERC_DIVISOR, rewardAmount, amount))

      // Check total stake, not updated until next 'addRewards'
      expect(await tenderFarm.totalStake()).to.eq(amount)

      expect(await tenderFarm.nextTotalStake()).to.eq(0)

      // Check paid rewards
      expect(await tenderToken.balanceOf(account1)).to.eq(rewardBalBefore.add(rewardAmount))
    })

    it('Unfarms tokens partially, harvest rewards', async () => {
      const rewardBalBefore = await tenderToken.balanceOf(account1)
      // stake for an account
      const amount = ethers.utils.parseEther('100')
      await lpToken.approve(tenderFarm.address, amount)

      // Check event
      await expect(tenderFarm.farmFor(account1, amount)).to.emit(tenderFarm, 'Farm').withArgs(
        account1, amount
      )

      // Check stake
      expect(await tenderFarm.stakeOf(account1)).to.eq(amount)
      let stake = await tenderFarm.stakes(account1)
      expect(stake.stake).to.eq(amount)
      expect(stake.lastCRF).to.eq(0)

      // Check total stake
      expect(await tenderFarm.totalStake()).to.eq(0)

      expect(await tenderFarm.nextTotalStake()).to.eq(amount)

      // Check rewards still 0
      expect(await tenderFarm.availableRewards(account1)).to.eq(0)

      // Add rewards
      const rewardAmount = ethers.utils.parseEther('100')
      await tenderToken.approve(tenderFarm.address, rewardAmount)
      await tenderFarm.addRewards(rewardAmount)

      const unfarmAmount = ethers.utils.parseEther('75')
      const tx = tenderFarm.connect(await ethers.getSigner(account1)).unfarm(unfarmAmount)
      await expect(tx).to.emit(tenderFarm, 'Unfarm').withArgs(
        account1, unfarmAmount
      )

      await expect(tx).to.emit(tenderFarm, 'Harvest').withArgs(account1, rewardAmount)

      // Check stake
      expect(await tenderFarm.stakeOf(account1)).to.eq(amount.sub(unfarmAmount))
      stake = await tenderFarm.stakes(account1)
      expect(stake.stake).to.eq(amount.sub(unfarmAmount))
      expect(stake.lastCRF).to.eq(percOf(PERC_DIVISOR, rewardAmount, amount))

      // Check total stake, not updated until next 'addRewards'
      expect(await tenderFarm.totalStake()).to.eq(amount)

      expect(await tenderFarm.nextTotalStake()).to.eq(amount.sub(unfarmAmount))

      // Check paid rewards
      expect(await tenderToken.balanceOf(account1)).to.eq(rewardBalBefore.add(rewardAmount))
    })
  })

  describe('Harvest', () => {
    const amount = ethers.utils.parseEther('100')

    beforeEach(async () => {
      await lpToken.approve(tenderFarm.address, amount)
      await tenderFarm.farm(amount)
    })

    it('reverts if transfer fails', async () => {
      const ttMock = await smockit(tenderToken)
      const TenderFarmFactory = await ethers.getContractFactory(
        'TenderFarm',
        signers[0]
      )
      tenderFarm = (await TenderFarmFactory.deploy()) as TenderFarm
      await tenderFarm.initialize(lpToken.address, ttMock.address, account0)

      const amount = ethers.utils.parseEther('100')
      await lpToken.approve(tenderFarm.address, amount)
      await tenderFarm.farm(amount)

      // Add rewards
      const rewardAmount = ethers.utils.parseEther('100')
      await tenderToken.approve(tenderFarm.address, rewardAmount)
      ttMock.smocked.transferFrom.will.return.with(true)
      ttMock.smocked.sharesToTokens.will.return.with(rewardAmount)
      ttMock.smocked.tokensToShares.will.return.with(rewardAmount)
      await tenderFarm.addRewards(rewardAmount)

      ttMock.smocked.transfer.will.return.with(false)

      await expect(tenderFarm.harvest()).to.be.revertedWith('TRANSFER_FAIL')
    })

    it('if there are no rewards nothing is harvested', async () => {
      const balBefore = await tenderToken.balanceOf(account0)
      await expect(tenderFarm.harvest()).to.not.emit(tenderFarm, 'Harvest')
      expect(await tenderToken.balanceOf(account0)).to.eq(balBefore)
      const stake = await tenderFarm.stakes(account0)
      expect(stake.lastCRF).to.eq(0)
    })

    it('harvests rewards', async () => {
      // Add rewards
      const rewardAmount = ethers.utils.parseEther('100')
      await tenderToken.approve(tenderFarm.address, rewardAmount)
      await tenderFarm.addRewards(rewardAmount)

      const balBefore = await tenderToken.balanceOf(account0)

      const tx = await tenderFarm.harvest()
      await expect(tx).to.emit(tenderFarm, 'Harvest').withArgs(account0, rewardAmount)
      await expect(tx).to.emit(tenderToken, 'Transfer').withArgs(tenderFarm.address, account0, rewardAmount)
      await tx.wait()
      expect(await tenderToken.balanceOf(account0)).to.eq(balBefore.add(rewardAmount))
      const stake = await tenderFarm.stakes(account0)
      expect(stake.lastCRF).to.eq(percOf(PERC_DIVISOR, rewardAmount, amount))
    })
  })

  describe('Add rewards', () => {
    const stakeAmount = ethers.utils.parseEther('150')
    const rewardAmount = ethers.utils.parseEther('100')
    beforeEach(async () => {
      await lpToken.approve(tenderFarm.address, stakeAmount)
      await tenderFarm.farm(stakeAmount)
      await tenderToken.approve(tenderFarm.address, rewardAmount)
    })

    it('reverts if not called by controller', async () => {
      await tenderToken.connect(signers[1]).approve(tenderFarm.address, rewardAmount)
      await expect(tenderFarm.connect(signers[1]).addRewards(rewardAmount)).to.be.reverted
    })

    it('reverts if transfer amound exceeds allowance', async () => {
      await expect(tenderFarm.addRewards(rewardAmount.mul(2))).to.be.reverted
    })

    it('emits an event', async () => {
      await expect(tenderFarm.addRewards(rewardAmount)).to.emit(tenderFarm, 'RewardsAdded').withArgs(rewardAmount)
    })

    it('sets total stake to next total stake', async () => {
      const nextStake = await tenderFarm.nextTotalStake()
      await tenderFarm.addRewards(rewardAmount)

      expect(await tenderFarm.totalStake()).to.eq(nextStake)
    })

    it('updates CRF', async () => {
      await tenderFarm.addRewards(rewardAmount)
      expect(await tenderFarm.CRF()).to.eq(percOf(PERC_DIVISOR, rewardAmount, stakeAmount))
    })
  })

  describe('Super test', () => {
    const amount0 = ethers.utils.parseEther('100')
    const amount1 = ethers.utils.parseEther('150')
    const amount2 = ethers.utils.parseEther('250')

    const rewardAmount = ethers.utils.parseEther('100')

    beforeEach(async () => {
      await lpToken.approve(tenderFarm.address, amount0)
      await tenderFarm.farm(amount0)

      await tenderToken.approve(tenderFarm.address, rewardAmount)
      await tenderFarm.addRewards(rewardAmount)

      await lpToken.approve(tenderFarm.address, amount1)
      await tenderFarm.farmFor(account1, amount1)

      await tenderToken.approve(tenderFarm.address, rewardAmount)
      await tenderFarm.addRewards(rewardAmount)

      await lpToken.approve(tenderFarm.address, amount2)
      await tenderFarm.farmFor(account2, amount2)
    })

    it('checks correct total stake and next total stake', async () => {
      // Check total stake
      expect(await tenderFarm.totalStake()).to.eq(amount0.add(amount1))

      expect(await tenderFarm.nextTotalStake()).to.eq(amount0.add(amount1).add(amount2))
    })

    it('Checks correct stake and rewards for account0', async () => {
      // Check stake
      expect(await tenderFarm.stakeOf(account0)).to.eq(amount0)
      const stake = await tenderFarm.stakes(account0)
      expect(stake.stake).to.eq(amount0)
      expect(stake.lastCRF).to.eq(0)

      // Check available rewards
      const CRF = PERC_DIVISOR.add(percOf(PERC_DIVISOR, rewardAmount, amount0.add(amount1)))
      const expRewards = percOf(amount0, CRF, PERC_DIVISOR)
      expect(await tenderFarm.availableRewards(account0)).to.eq(expRewards)
    })

    it('Checks correct stake and rewards for account1', async () => {
      // Check stake
      expect(await tenderFarm.stakeOf(account1)).to.eq(amount1)
      const stake = await tenderFarm.stakes(account1)
      expect(stake.stake).to.eq(amount1)
      expect(stake.lastCRF).to.eq(percOf(PERC_DIVISOR, rewardAmount, amount0))

      // Check available rewards
      const CRF = percOf(PERC_DIVISOR, rewardAmount, amount0.add(amount1))
      const expRewards = percOf(amount1, CRF, PERC_DIVISOR)
      expect(await tenderFarm.availableRewards(account1)).to.eq(expRewards)
    })

    it('Checks correct stake and rewards for account2', async () => {
      // Check stake
      expect(await tenderFarm.stakeOf(account2)).to.eq(amount2)
      const stake = await tenderFarm.stakes(account2)
      expect(stake.stake).to.eq(amount2)
      const CRF0 = percOf(PERC_DIVISOR, rewardAmount, amount0)
      expect(stake.lastCRF).to.eq(CRF0.add(percOf(PERC_DIVISOR, rewardAmount, amount0.add(amount1))))

      // Check available rewards
      expect(await tenderFarm.availableRewards(account2)).to.eq(0)
    })
  })

  describe('Setting Controller', () => {
    it('reverts if Zero address is set', async () => {
      await expect(tenderFarm.setController(ethers.constants.AddressZero)).to.be.revertedWith('ZERO_ADDRESS')
    })

    it('sets controller successfully', async () => {
      const newControllerAddr = '0xfA668FB97697200FA56ce98E246db61Cc7E14Bd5' // dummy
      await tenderFarm.setController(newControllerAddr)
      expect(await tenderFarm.controller()).to.equal(newControllerAddr)
    })
  })
})
