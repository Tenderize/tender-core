import { Transaction } from 'ethers/lib/ethers'
import { expect } from 'chai'

export default function suite () {
  let tx: Transaction
  let ctx: any
  beforeEach(async function () {
    ctx = this.test?.ctx!
    await ctx.Steak.approve(ctx.Tenderizer.address, ctx.deposit)
    await ctx.Tenderizer.deposit(ctx.deposit)
    tx = await ctx.Tenderizer.claimRewards()
  })

  it('bond succeeds', async () => {
    // ctx.StakingContract.function.will.return()
    expect(await ctx.StakingContract.staked()).to.eq(
      ctx.initialStake.add(ctx.deposit).sub(
        ctx.initialStake.add(ctx.deposit).mul(ctx.DELEGATION_TAX || 0).div(ctx.MAX_PPM || 1)
      )
    )
  })

  it('emits Stake event from ctx.tenderizer', async () => {
    expect(tx).to.emit(ctx.Tenderizer, 'Stake').withArgs(ctx.NODE, ctx.deposit.add(ctx.initialStake))
  })

  it('returns without calling bond() if zero balance is passed', async () => {
    const before = await ctx.StakingContract.staked()
    await ctx.Tenderizer.claimRewards()
    expect(await ctx.StakingContract.staked()).to.eq(before)
  })
}
