import { getCurrentBlockTimestamp } from '../../util/evm'
import { expect } from 'chai'
import { Context } from 'mocha'

export default function suite () {
  let ctx: Context
  beforeEach(async function () {
    ctx = this.test?.ctx!
    await ctx.Steak.approve(ctx.Tenderizer.address, ctx.deposit)
    await ctx.Tenderizer.deposit(ctx.deposit)
  })

  describe('swap against TenderSwap', () => {
    it('swaps tenderToken for Token', async function () {
      const amount = ctx.deposit.div(2)
      const lptBalBefore = await ctx.Steak.balanceOf(ctx.deployer)

      const dy = await ctx.TenderSwap.calculateSwap(ctx.TenderToken.address, amount)
      await ctx.TenderToken.approve(ctx.TenderSwap.address, amount)
      await ctx.TenderSwap.swap(
        ctx.TenderToken.address,
        amount,
        dy,
        (await getCurrentBlockTimestamp()) + 1000
      )

      const lptBalAfter = await ctx.Steak.balanceOf(ctx.deployer)
      expect(lptBalAfter.sub(lptBalBefore)).to.eq(dy)
    })
  })
}
