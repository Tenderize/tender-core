import { expect } from 'chai'

export default function suite () {
  let ctx: any
  before(async function () {
    ctx = this.test?.ctx
  })

  it('current principle is 0', async function () {
    expect(await ctx.Tenderizer.totalStakedTokens()).to.be.eq(0)
  })

  it('pending fees are 0', async function () {
    expect(await ctx.Tenderizer.pendingFees()).to.be.eq(0)
    expect(await ctx.Tenderizer.pendingLiquidityFees()).to.be.eq(0)
  })

  it('claimRewards() does not revert', async function () {
    await expect(ctx.Tenderizer.claimRewards()).to.be.not.reverted
  })

  it('collectFees() does not revert', async function () {
    await expect(ctx.Tenderizer.collectFees()).to.be.not.reverted
  })

  it('collectLiquidityFees() does not revert', async function () {
    await expect(ctx.Tenderizer.collectLiquidityFees()).to.be.not.reverted
  })

  it('TenderToken supply is 0', async function () {
    expect(await ctx.TenderToken.totalSupply()).to.be.eq(0)
  })

  it('LP Token balances are 0', async function () {
    expect(await ctx.TenderSwap.getToken0Balance()).to.be.eq(0)
    expect(await ctx.TenderSwap.getToken1Balance()).to.be.eq(0)
  })

  it('LPToken supply is 0', async function () {
    expect(await ctx.LpToken.totalSupply()).to.be.eq(0)
  })
}
