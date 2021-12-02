import { ContractTransaction } from 'ethers/lib/ethers'
import { expect } from 'chai'
import { smockit } from '@eth-optimism/smock'
import { ethers } from 'hardhat'

export default function suite () {
  let tx: ContractTransaction
  let ctx: any
  before(async function () {
    ctx = this.test?.ctx
  })
  describe('setting staking contract', () => {
    it('sets staking contract', async () => {
      const newStakingContract = await smockit(ctx.StakingContractNoMock)

      // TODO: Anti-pattern, refactor!
      if (ctx.NAME === 'Audius') {
        const dummyStakingAddress = '0xfA668FB97697200FA56ce98E246db61Cc7E14Bd5'
        newStakingContract.smocked.getStakingAddress.will.return.with(dummyStakingAddress)
      }

      const txData = ctx.Tenderizer.interface.encodeFunctionData('setStakingContract', [newStakingContract.address])
      tx = await ctx.Controller.execute(ctx.Tenderizer.address, 0, txData)

      // assert that bond() call is made to new staking contract on gulp()
      // Except for matic, TODO: Anti-pattern, Improve this?
      if (ctx.NAME !== 'Matic') {
        await ctx.Controller.gulp()
        expect(ctx.stakeMock.function.calls.length).to.eq(0)
        expect(newStakingContract.smocked[ctx.stakeMock.functionName].calls.length).to.eq(1)
      }
    })

    it('should emit GovernanceUpdate event', async () => {
      expect(tx).to.emit(ctx.Tenderizer, 'GovernanceUpdate').withArgs('STAKING_CONTRACT')
    })
  })

  describe('setting node', async () => {
    it('reverts if Zero address is set', async () => {
      const txData = ctx.Tenderizer.interface.encodeFunctionData('setNode', [ethers.constants.AddressZero])
      await expect(ctx.Controller.execute(ctx.Tenderizer.address, 0, txData)).to.be.revertedWith('ZERO_ADDRESS')
    })

    it('reverts if not called by controller', async () => {
      await expect(ctx.Tenderizer.setNode(ethers.constants.AddressZero)).to.be.reverted
    })

    it('sets node successfully', async () => {
      const newNodeAddress = '0xd944a0F8C64D292a94C34e85d9038395e3762751'
      const txData = ctx.Tenderizer.interface.encodeFunctionData('setNode', [newNodeAddress])
      tx = await ctx.Controller.execute(ctx.Tenderizer.address, 0, txData)
      expect(await ctx.Tenderizer.node()).to.equal(newNodeAddress)
    })

    it('should emit GovernanceUpdate event', async () => {
      expect(tx).to.emit(ctx.Tenderizer, 'GovernanceUpdate').withArgs('NODE')
    })
  })

  describe('setting steak', async () => {
    it('reverts if Zero address is set', async () => {
      const txData = ctx.Tenderizer.interface.encodeFunctionData('setSteak', [ethers.constants.AddressZero])
      await expect(ctx.Controller.execute(ctx.Tenderizer.address, 0, txData)).to.be.revertedWith('ZERO_ADDRESS')
    })

    it('sets steak successfully', async () => {
      const newSteakAddress = '0xd944a0F8C64D292a94C34e85d9038395e3762751'
      const txData = ctx.Tenderizer.interface.encodeFunctionData('setSteak', [newSteakAddress])
      tx = await ctx.Controller.execute(ctx.Tenderizer.address, 0, txData)
      expect(await ctx.Tenderizer.steak()).to.equal(newSteakAddress)
    })

    it('should emit GovernanceUpdate event', async () => {
      expect(tx).to.emit(ctx.Tenderizer, 'GovernanceUpdate').withArgs('STEAK')
    })
  })

  describe('setting protocol fee', async () => {
    it('sets protocol fee', async () => {
      const newFee = ethers.utils.parseEther('0.05') // 5%
      const txData = ctx.Tenderizer.interface.encodeFunctionData('setProtocolFee', [newFee])
      tx = await ctx.Controller.execute(ctx.Tenderizer.address, 0, txData)
      expect(await ctx.Tenderizer.protocolFee()).to.equal(newFee)
    })

    it('should emit GovernanceUpdate event', async () => {
      expect(tx).to.emit(ctx.Tenderizer, 'GovernanceUpdate').withArgs('PROTOCOL_FEE')
    })
  })

  describe('setting liquidity fee', async () => {
    it('sets liquidity fee', async () => {
      const newFee = ethers.utils.parseEther('0.05') // 5%
      const txData = ctx.Tenderizer.interface.encodeFunctionData('setLiquidityFee', [newFee])
      tx = await ctx.Controller.execute(ctx.Tenderizer.address, 0, txData)
      expect(await ctx.Tenderizer.liquidityFee()).to.equal(newFee)
    })

    it('should emit GovernanceUpdate event', async () => {
      expect(tx).to.emit(ctx.Tenderizer, 'GovernanceUpdate').withArgs('LIQUIDITY_FEE')
    })
  })

  describe('setting controller', async () => {
    it('reverts if Zero address is set', async () => {
      const txData = ctx.Tenderizer.interface.encodeFunctionData('setController', [ethers.constants.AddressZero])
      await expect(ctx.Controller.execute(ctx.Tenderizer.address, 0, txData)).to.be.revertedWith('ZERO_ADDRESS')
    })

    it('sets controller successfully', async () => {
      const newControllerAddress = '0xd944a0F8C64D292a94C34e85d9038395e3762751'
      const txData = ctx.Tenderizer.interface.encodeFunctionData('setController', [newControllerAddress])
      tx = await ctx.Controller.execute(ctx.Tenderizer.address, 0, txData)
      expect(await ctx.Tenderizer.controller()).to.equal(newControllerAddress)
    })

    it('should emit GovernanceUpdate event', async () => {
      expect(tx).to.emit(ctx.Tenderizer, 'GovernanceUpdate').withArgs('CONTROLLER')
    })
  })
}
