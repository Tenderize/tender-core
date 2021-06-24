
import chai from 'chai'
import {
  solidity
} from 'ethereum-waffle'
import ethersTypes from 'ethers'
import { ethers } from 'hardhat'

import { Registry } from '../../typechain/'

chai.use(solidity)
const {
  expect
} = chai

describe('Tenderizer Registry', () => {
  let registry: Registry
  let signers: ethersTypes.Signer[]

  beforeEach('Deploy Registry', async () => {
    signers = await ethers.getSigners()
    const RegFactory = await ethers.getContractFactory('Registry', signers[0])

    registry = (await RegFactory.deploy()) as Registry
    await registry.deployed()
  })

  describe('Initial state', () => {
    it('Owner is deployer', async () => {
      expect(await registry.owner()).to.eq(await signers[0].getAddress())
    })
  })

  describe('add tenderizer', () => {
    const config = {
      name: 'livepeer',
      steak: ethers.utils.getAddress('0xf247196f2f2e5419733bd7a78b44dd319b3ee763'),
      tenderizer: ethers.utils.getAddress('0x09eab21c40743b2364b94345419138ef80f39e30'),
      tenderToken: ethers.utils.getAddress('0x0a130B8564E7a20708679dA1163C3344584C10D0'),
      esp: ethers.utils.getAddress('0x3cD751E6b0078Be393132286c442345e5DC49699'),
      bpool: ethers.utils.getAddress('0xdAC17F958D2ee523a2206206994597C13D831ec7'),
      tenderFarm: ethers.utils.getAddress('0x80002bd1d2F6867b8a1b328155eF46c234F57d46')
    }
    it('reverts if caller is not owner', async () => {
      await expect(registry.connect(signers[1]).addTenderizer(config)).to.be.reverted.revertedWith('caller is not the owner')
    })
    it('emits a TenderizerCreated event', async () => {
      const arr = [config.name, config.steak, config.tenderizer, config.tenderToken, config.esp, config.bpool, config.tenderFarm]
      await expect(registry.addTenderizer(config)).to.emit(registry, 'TenderizerCreated').withArgs(arr)
    })
  })
})
