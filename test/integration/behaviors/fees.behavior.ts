import { BigNumber, ContractTransaction } from 'ethers/lib/ethers'
import { expect } from 'chai'
import { ethers } from 'hardhat'

export function protocolFeeTests () {
  let tx: ContractTransaction
  let ctx: any
  let fees: BigNumber
  let ownerBalBefore: BigNumber
  let otherAccBalBefore: BigNumber

  before(async function () {
    ctx = this.test?.ctx
    fees = await ctx.Tenderizer.pendingFees()
    ownerBalBefore = await ctx.TenderToken.balanceOf(ctx.deployer)
    otherAccBalBefore = await ctx.TenderToken.balanceOf(ctx.signers[2].address)
    tx = await ctx.Controller.collectFees()
    await tx.wait()
  })

  it('should reset pendingFees', async () => {
    expect(await ctx.Tenderizer.pendingFees()).to.eq(ethers.constants.Zero)
  })

  it('should increase tenderToken balance of owner', async () => {
    expect(await ctx.TenderToken.balanceOf(ctx.deployer))
      .to.eq(ownerBalBefore.add(fees).sub(1))
  })

  it('should not change balance of other account', async () => {
    expect(await ctx.TenderToken.balanceOf(ctx.signers[2].address)).to.eq(otherAccBalBefore)
  })

  it('should emit ProtocolFeeCollected event from Tenderizer', async () => {
    await expect(tx).to.emit(ctx.Tenderizer, 'ProtocolFeeCollected').withArgs(fees)
  })
}

export function liquidityFeeTests () {
  let tx: ContractTransaction
  let ctx: any
  let fees: BigNumber
  let farmBalanceBefore: BigNumber
  let acc0BalBefore: BigNumber

  before(async function () {
    ctx = this.test?.ctx
    fees = await ctx.Tenderizer.pendingLiquidityFees()
    farmBalanceBefore = await ctx.TenderToken.balanceOf(ctx.TenderFarm.address)
    acc0BalBefore = await ctx.TenderToken.balanceOf(ctx.deployer)
    tx = await ctx.Controller.collectLiquidityFees()
    await tx.wait()
  })

  it('should reset pendingFees', async () => {
    expect(await ctx.Tenderizer.pendingLiquidityFees()).to.eq(ethers.constants.Zero)
  })

  it('should increase tenderToken balance of tenderFarm', async () => {
    expect(await ctx.TenderToken.balanceOf(ctx.TenderFarm.address)).to.eq(farmBalanceBefore.add(fees).sub(1))
  })

  it('should not change balance of other account', async () => {
    expect(await ctx.TenderToken.balanceOf(ctx.deployer)).to.eq(acc0BalBefore)
  })

  it('should emit ProtocolFeeCollected event from Tenderizer', async () => {
    await expect(tx).to.emit(ctx.Tenderizer, 'LiquidityFeeCollected').withArgs(fees)
  })
}
