import {
  ethers
} from 'hardhat'
import ethersTypes from 'ethers'
import chai from 'chai'
import {
  solidity
} from 'ethereum-waffle'
import {
  Controller
} from '../../typechain/'

import * as rpc from '../util/snapshot'
chai.use(solidity)
const {
  expect
} = chai

describe('Controller', () => {
  let snapshotId: any

  let controller: Controller
  let signers: ethersTypes.Signer[]

  let account0: string

  const steak = '0x0000000000000000000000000000000000000001'
  const tenderizer = '0x0000000000000000000000000000000000000002'
  const tenderToken = '0x0000000000000000000000000000000000000003'
  const esp = '0x0000000000000000000000000000000000000004'

  beforeEach(async () => {
    snapshotId = await rpc.snapshot()
  })

  afterEach(async () => {
    await rpc.revert(snapshotId)
  })

  beforeEach('Deploy Controller', async () => {
    signers = await ethers.getSigners()
    const ControllerFactory = await ethers.getContractFactory(
      'Controller',
      signers[0]
    )

    account0 = await signers[0].getAddress()

    controller = (await ControllerFactory.deploy(steak, tenderizer, tenderToken, esp)) as Controller
    await controller.deployed()
  })

  describe('Constructor', () => {
    it('Owner is deployer', async () => {
      expect(await controller.owner()).to.eq(account0)
    })

    it('Sets steak token', async () => {
      expect(await controller.steak()).to.eq(steak)
    })

    it('Sets tenderizer', async () => {
      expect(await controller.tenderizer()).to.eq(tenderizer)
    })

    it('Sets tenderToken', async () => {
      expect(await controller.tenderToken()).to.eq(tenderToken)
    })

    it('Sets ESP', async () => {
      expect(await controller.esp()).to.eq(esp)
    })
  })

  describe('Deposit', () => {
    it('revert if amount is 0', async () => {
      await expect(controller.deposit(ethers.constants.Zero)).to.be.revertedWith('ZERO_AMOUNT')
    })

    it('revert if transferFrom fails', async () => {

    })

    it('revert if mint fails', async () => {

    })
  })
})
