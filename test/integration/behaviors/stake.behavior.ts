import { Transaction } from 'ethers/lib/ethers'
import { expect } from 'chai'
import { Context } from 'mocha'

export default function suite () {
  let tx: Transaction
  let ctx: Context
  before(async function () {
    ctx = this.test?.ctx!
  })

  it('bond succeeds', async () => {
    // ctx.StakingContract.function.will.return()
    tx = await ctx.Tenderizer.claimRewards()
    expect(await ctx.StakingContract.staked()).to.eq(
      ctx.initialStake.add(ctx.deposit).sub(
        ctx.initialStake.add(ctx.deposit).mul(ctx.DELEGATION_TAX || 0).div(ctx.MAX_PPM || 1)
      )
    )
    // expect(ctx.StakingContract.function.calls.length).to.eq(1)
    // // TODO: Antipattern - Refactor, possibly have assertion function defined
    // // in main test file that are then called from here
    // if (ctx.NAME === 'Matic') {
    //   const minSharesToMint = ctx.deposit.add(ctx.initialStake)
    //     .mul(ctx.exchangeRatePrecision).div(ctx.fxRate).sub(1)
    //   expect(ctx.StakingContract.function.calls[0]._minSharesToMint).to.eq(minSharesToMint)
    // } else {
    //   expect(ctx.StakingContract.function.calls[0][ctx.StakingContract.nodeParam]).to.eq(ctx.NODE)
    // }
    // expect(ctx.StakingContract.function.calls[0][ctx.StakingContract.amountParam])
    //   .to.eq(ctx.deposit.add(ctx.initialStake))
  })

  it('emits Stake event from ctx.tenderizer', async () => {
    expect(tx).to.emit(ctx.Tenderizer, 'Stake').withArgs(ctx.NODE, ctx.deposit.add(ctx.initialStake))
  })

  // it('uses specified node if passed, not default', async () => {
  //   let newNodeAddress: string
  //   // TODO: Antipattern - Refactor
  //   const newValidatorShare = await smockit(ctx.StakingContractNoMock)
  //   if (ctx.NAME === 'Matic') {
  //     newValidatorShare.smocked.buyVoucher.will.return()
  //     newNodeAddress = newValidatorShare.address
  //   } else {
  //     newNodeAddress = '0xd944a0F8C64D292a94C34e85d9038395e3762751' // dummy
  //   }
  //   await ctx.Tenderizer.stake(newNodeAddress, ctx.deposit.add(ctx.initialStake))
  //   // TODO: Antipattern - Refactor
  //   if (ctx.NAME === 'Matic') {
  //     expect(newValidatorShare.smocked.buyVoucher.calls.length).to.eq(1)
  //   } else {
  //     expect(ctx.StakingContract.function.calls[0][ctx.StakingContract.nodeParam]).to.eq(newNodeAddress)
  //   }
  // })

  // it('uses specified amount if passed, not contract token balance', async () => {
  //   const amount = ethers.utils.parseEther('0.1')
  //   await ctx.Tenderizer.stake(ethers.constants.AddressZero, amount)
  //   expect(ctx.StakingContract.function.calls[0][ctx.StakingContract.amountParam]).to.eq(amount)
  // })

  it('returns without calling bond() if zero balance is passed', async () => {
    const before = await ctx.StakingContract.staked()
    await ctx.Tenderizer.claimRewards()
    expect(await ctx.StakingContract.staked()).to.eq(before)
  })
}
