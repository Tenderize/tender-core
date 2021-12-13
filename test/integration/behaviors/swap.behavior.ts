import { getCurrentBlockTimestamp } from '../../util/evm'
import { expect } from 'chai'

export default function suite () {
  let ctx: any
  before(async function () {
    ctx = this.test?.ctx
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
