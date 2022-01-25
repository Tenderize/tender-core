import { getCurrentBlockTimestamp } from '../../util/evm'

export default async function depositTenderizer (ctx: any) {
  // Deposit initial stake
  await ctx.Steak.approve(ctx.Tenderizer.address, ctx.initialStake)
  await ctx.Tenderizer.deposit(ctx.initialStake)
  // await ctx.Tenderizer.claimRewards()
  // Add initial liquidity
  const tokensAfterTax = ctx.initialStake.sub(ctx.initialStake.mul(ctx.DELEGATION_TAX).div(ctx.MAX_PPM))
  await ctx.Steak.approve(ctx.TenderSwap.address, tokensAfterTax)
  await ctx.TenderToken.approve(ctx.TenderSwap.address, tokensAfterTax)
  const lpTokensOut = await ctx.TenderSwap.calculateTokenAmount([tokensAfterTax, tokensAfterTax], true)
  await ctx.TenderSwap.addLiquidity([tokensAfterTax, tokensAfterTax], lpTokensOut, (await getCurrentBlockTimestamp()) + 1000)
  console.log('added liquidity')
  console.log('calculated', lpTokensOut.toString(), 'actual', (await ctx.LpToken.balanceOf(ctx.deployer)).toString())
  await ctx.LpToken.approve(ctx.TenderFarm.address, lpTokensOut)
  await ctx.TenderFarm.farm(lpTokensOut)
  console.log('farmed LP tokens')
}
