import { BigNumber, Contract, ContractTransaction } from 'ethers/lib/ethers'
import { expect } from 'chai'
import { smockit } from '@eth-optimism/smock'
import { ethers } from 'hardhat'
import { Context } from 'mocha'

export default function suite () {
  let tx: ContractTransaction
  let ctx: Context
  enum GovernanceParameter {
    GOV,
    NODE,
    STEAK,
    PROTOCOL_FEE,
    LIQUIDITY_FEE,
    TENDERFARM,
    STAKING_CONTRACT
}
  beforeEach(async function () {
    ctx = this.test?.ctx!
  })
  describe('setting staking contract', () => {
    let newStakingContract: Contract
    beforeEach(async () => {
      newStakingContract = await smockit(ctx.StakingContract)
      tx = await ctx.Tenderizer.setStakingContract(newStakingContract.address)
    })

    it('should emit GovernanceUpdate event', async () => {
      expect(tx).to.emit(ctx.Tenderizer, 'GovernanceUpdate')
        .withArgs(GovernanceParameter.STAKING_CONTRACT,
        ethers.utils.hexZeroPad(ctx.StakingContract.address.toLowerCase(), 32),
        ethers.utils.hexZeroPad(newStakingContract.address.toLowerCase(), 32))
    })
  })

  describe('setting node', async () => {
    it('reverts if not called by controller', async () => {
      await expect(ctx.Tenderizer.connect(ctx.signers[1]).setNode(ethers.constants.AddressZero)).to.be.reverted
    })

    describe('sets node successfully', async function(){
      const newNodeAddress = '0xf4e8Ef0763BCB2B1aF693F5970a00050a6aC7E1B'
      beforeEach(async function(){
        tx = await ctx.Tenderizer.setNode(newNodeAddress)
      })

      it('sets correctly', async () => {
        expect((await ctx.Tenderizer.node())).to.equal(newNodeAddress)
      })
      
      it('should emit GovernanceUpdate event', async () => {
        expect(tx).to.emit(ctx.Tenderizer, 'GovernanceUpdate').withArgs(
          GovernanceParameter.NODE,
          ethers.utils.hexZeroPad(ctx.NODE.toLowerCase(), 32),
          ethers.utils.hexZeroPad(newNodeAddress.toLowerCase(), 32))
      })
    })
  })

  describe('setting steak', async () => {
    const newSteakAddress = '0xd944a0f8c64d292a94c34e85d9038395e3762751'

    beforeEach(async function() {
      tx = await ctx.Tenderizer.setSteak(newSteakAddress)
    })

    it('sets steak successfully', async () => {
      expect((await ctx.Tenderizer.steak()).toLowerCase()).to.equal(newSteakAddress)
    })

    it('should emit GovernanceUpdate event', async () => {
      expect(tx).to.emit(ctx.Tenderizer, 'GovernanceUpdate').withArgs(
        GovernanceParameter.STEAK,
        ethers.utils.hexZeroPad(ctx.Steak.address.toLowerCase(), 32),
        ethers.utils.hexZeroPad(newSteakAddress, 32)
      )
    })
  })

  describe('setting protocol fee', async () => {
    let oldFee: BigNumber
    const newFee = ethers.utils.parseEther('0.05')

    beforeEach(async function () {
      oldFee = await ctx.Tenderizer.liquidityFee()
      tx = await ctx.Tenderizer.setProtocolFee(newFee)
    })

    it('sets protocol fee', async () => {
      expect(await ctx.Tenderizer.protocolFee()).to.equal(newFee)
    })

    it('should emit GovernanceUpdate event', async () => {
      expect(tx).to.emit(ctx.Tenderizer, 'GovernanceUpdate').withArgs(GovernanceParameter.PROTOCOL_FEE, oldFee, newFee)
    })
  })

  describe('setting liquidity fee', async () => {
    let oldFee: BigNumber
    const newFee = ethers.utils.parseEther('0.05')
    
    beforeEach(async function () {
      oldFee = await ctx.Tenderizer.liquidityFee()
      tx = await ctx.Tenderizer.setLiquidityFee(newFee)
    })

    it('sets liquidity fee', async () => {
      expect(await ctx.Tenderizer.liquidityFee()).to.equal(newFee)
    })

    it('should emit GovernanceUpdate event', async () => {
      expect(tx).to.emit(ctx.Tenderizer, 'GovernanceUpdate').withArgs(GovernanceParameter.LIQUIDITY_FEE, oldFee, newFee)
    })
  })

  describe('setting gov', async () => {
    it('reverts if not called by gov', async () => {
      await expect(ctx.Tenderizer.connect(ctx.signers[1]).setGov(ethers.constants.AddressZero)).to.be.reverted
    })

    describe('sets gov successfully', async () => {
      const newGovAddress = '0xd944a0F8C64D292a94C34e85d9038395e3762751'
      beforeEach(async function() {
        tx = await ctx.Tenderizer.setGov(newGovAddress)
      })

      it('sets correctly', async () => {
        expect(await ctx.Tenderizer.gov()).to.equal(newGovAddress)
      })

      it('should emit GovernanceUpdate event', async () => {
        expect(tx).to.emit(ctx.Tenderizer, 'GovernanceUpdate').withArgs(
          GovernanceParameter.GOV, 
          ethers.utils.hexZeroPad(ctx.deployer.toLowerCase(), 32), 
          ethers.utils.hexZeroPad(newGovAddress.toLowerCase(), 32))
      })
    })
  })
}
