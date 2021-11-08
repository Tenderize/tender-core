import {
  ethers, upgrades
} from 'hardhat'
import { MockContract, smockit } from '@eth-optimism/smock'
import ethersTypes from 'ethers'
import chai from 'chai'
import {
  solidity
} from 'ethereum-waffle'
import {
  TenderToken,
  SimpleToken,
  TenderFarm
} from '../../typechain/'

import * as rpc from '../util/snapshot'
chai.use(solidity)
const {
  expect
} = chai

describe('Controller', () => {
  let snapshotId: any

  let controller: any
  let signers: ethersTypes.Signer[]

  let account0: string

  let steakMock : MockContract
  const tenderizer = '0x0000000000000000000000000000000000000002'
  let tenderTokenMock : MockContract
  const esp = '0x0000000000000000000000000000000000000004'
  let tenderFarmMock: MockContract
  let tenderFarmNoMock: TenderFarm

  const depositAmount = ethers.utils.parseEther('100')

  beforeEach(async () => {
    snapshotId = await rpc.snapshot()
  })

  afterEach(async () => {
    await rpc.revert(snapshotId)
  })

  beforeEach('Deploy TenderToken Mock', async () => {
    signers = await ethers.getSigners()
    const TenderTokenFactory = await ethers.getContractFactory(
      'TenderToken',
      signers[0]
    )

    const tenderToken = (await TenderTokenFactory.deploy('tender-TestToken', 't-TEST')) as TenderToken
    tenderTokenMock = await smockit(tenderToken)
  })

  beforeEach('Deploy Steak Token Mock', async () => {
    signers = await ethers.getSigners()
    const SimpleTokenFactory = await ethers.getContractFactory(
      'SimpleToken',
      signers[0]
    )

    const testToken = (await SimpleTokenFactory.deploy('Test Token', 'TEST', ethers.utils.parseEther('1000000'))) as SimpleToken
    steakMock = await smockit(testToken)
  })

  beforeEach('Deploy TenderFarm Mock', async () => {
    signers = await ethers.getSigners()
    const TenderFarmFactory = await ethers.getContractFactory(
      'TenderFarm',
      signers[0]
    )

    tenderFarmNoMock = (await TenderFarmFactory.deploy()) as TenderFarm
    tenderFarmMock = await smockit(tenderFarmNoMock)
  })

  beforeEach('Deploy Controller', async () => {
    signers = await ethers.getSigners()
    const ControllerFactory = await ethers.getContractFactory(
      'Controller',
      signers[0]
    )

    account0 = await signers[0].getAddress()

    controller = await upgrades.deployProxy(ControllerFactory, [steakMock.address, tenderizer, tenderTokenMock.address, esp])
    await controller.deployed()
    await controller.setTenderFarm(tenderFarmMock.address)
  })

  describe('Constructor', () => {
    it('Gov is initially deployer', async () => {
      expect(await controller.gov()).to.eq(account0)
    })

    it('Sets steak token', async () => {
      expect(await controller.steak()).to.eq(steakMock.address)
    })

    it('Sets tenderizer', async () => {
      expect(await controller.tenderizer()).to.eq(tenderizer)
    })

    it('Sets tenderToken', async () => {
      expect(await controller.tenderToken()).to.eq(tenderTokenMock.address)
    })

    it('Sets ESP', async () => {
      expect(await controller.esp()).to.eq(esp)
    })
  })

  describe('Deposit', () => {
    it('revert if amount is 0', async () => {
      await expect(controller.deposit(ethers.constants.Zero)).to.be.revertedWith('ZERO_AMOUNT')
    })

    it('revert if mint fails', async () => {
      tenderTokenMock.smocked.mint.will.return()
      await expect(controller.deposit(depositAmount)).to.be.reverted
    })

    it('revert if transferFrom fails', async () => {
      tenderTokenMock.smocked.mint.will.return.with(true)
      steakMock.smocked.transferFrom.will.revert()
      await expect(controller.deposit(depositAmount)).to.be.reverted
    })
  })

  describe('Unlock', () => {
    it('revert if amount is 0', async () => {
      await expect(controller.unlock(ethers.constants.Zero)).to.be.revertedWith('ZERO_AMOUNT')
    })

    it('revert if burn fails', async () => {
      tenderTokenMock.smocked.burn.will.return()
      await expect(controller.unlock(depositAmount)).to.be.reverted
    })
  })

  describe('Collect Liquidity Fees', () => {
    it('return if nextTotalStake is 0', async () => {
      tenderFarmMock.smocked.nextTotalStake.will.return.with(0)
      await controller.collectLiquidityFees()
      expect(tenderTokenMock.smocked.mint.calls.length).to.eq(0)
      expect(tenderFarmMock.smocked.addRewards.calls.length).to.eq(0)
    })
  })

  describe('Batch Execute', () => {
    it('reverts if invalid arguement counts', async () => {
      await expect(controller.batchExecute(
        [tenderFarmNoMock.address], // missing target
        [0, 0],
        [tenderFarmNoMock.interface.encodeFunctionData('farm', [depositAmount]),
          tenderFarmNoMock.interface.encodeFunctionData('harvest')]
      )).to.be.revertedWith('INVALID_ARGUMENTS')
    })
  })

  describe('Upgrade Controller', () => {
    it('upgrades Controller - steak() remains the same', async () => {
      // Upgrade farm
      const newFac = await ethers.getContractFactory('Controller', signers[0])
      controller = await upgrades.upgradeProxy(controller.address, newFac)

      expect(await controller.steak()).to.equal(steakMock.address)
    })
  })

  describe('setting new gov address', async () => {
    const newDummyGov = '0xd944a0F8C64D292a94C34e85d9038395e3762751'
    it('reverts if Zero address is set', async () => {
      await expect(controller.setGov(ethers.constants.AddressZero)).to.be.revertedWith('ZERO_ADDRESS')
    })

    it('reverts if not called by current gov', async () => {
      await expect(controller.connect(signers[1]).setGov(newDummyGov)).to.be.reverted
    })

    it('sets gov successfully', async () => {
      await controller.setGov(newDummyGov)
      expect(await controller.gov()).to.equal(newDummyGov)
    })
  })
})
