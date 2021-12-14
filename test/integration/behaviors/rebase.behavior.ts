import { BigNumber, ContractTransaction, Transaction } from 'ethers/lib/ethers'
import { ethers } from 'hardhat'
import { expect } from 'chai'
import { sharesToTokens } from '../../util/helpers'

const ONE = ethers.utils.parseEther('1')

export function stakeIncreaseTests () {
  let tx: Transaction
  let ctx: any
  let totalShares: BigNumber
  let dyBefore: BigNumber
  let swapStakeBalBefore: BigNumber

  before(async function () {
    ctx = this.test?.ctx
    dyBefore = await ctx.TenderSwap.calculateSwap(ctx.TenderToken.address, ONE)
    swapStakeBalBefore = await ctx.Steak.balanceOf(ctx.TenderSwap.address)
    tx = await ctx.Controller.rebase()
  })

  it('updates currentPrincipal', async () => {
    expect(await ctx.Tenderizer.currentPrincipal()).to.eq(ctx.newStakeMinusFees)
  })

  it('increases tendertoken balances when rewards are added', async () => {
    // account 0
    const shares = await ctx.TenderToken.sharesOf(ctx.deployer)
    totalShares = await ctx.TenderToken.getTotalShares()
    expect(await ctx.TenderToken.balanceOf(ctx.deployer)).to.eq(sharesToTokens(shares, totalShares, await ctx.TenderToken.totalSupply()))
  })

  it('increases the tenderToken balance of the AMM', async () => {
    const shares = await ctx.TenderToken.sharesOf(ctx.TenderSwap.address)
    expect(await ctx.TenderToken.balanceOf(ctx.TenderSwap.address)).to.eq(sharesToTokens(shares, totalShares, await ctx.TenderToken.totalSupply()))
  })

  it('steak balance stays the same', async () => {
    expect(await ctx.Steak.balanceOf(ctx.TenderSwap.address)).to.eq(swapStakeBalBefore)
  })

  it('tenderToken price slightly decreases vs underlying', async () => {
    expect(await ctx.TenderSwap.calculateSwap(ctx.TenderToken.address, ONE)).to.be.lt(dyBefore)
  })

  it('should emit RewardsClaimed event from Tenderizer', async () => {
    const oldPrinciple = ctx.deposit.add(ctx.initialStake)
      .sub(ctx.deposit.add(ctx.initialStake).mul(ctx.DELEGATION_TAX).div(ctx.MAX_PPM))
    expect(tx).to.emit(ctx.Tenderizer, 'RewardsClaimed')
      .withArgs(ctx.increase, ctx.newStakeMinusFees, oldPrinciple)
  })
}

export function stakeStaysSameTests () {
  let ctx: any
  let feesBefore: BigNumber

  before(async function () {
    ctx = this.test?.ctx
    feesBefore = await ctx.Tenderizer.pendingFees()
    await ctx.Controller.rebase()
  })

  it('currentPrincipal stays the same', async () => {
    expect(await ctx.Tenderizer.currentPrincipal()).to.eq(ctx.stakeMinusFees)
  })

  it('pending fees stay the same', async () => {
    expect(await ctx.Tenderizer.pendingFees()).to.eq(feesBefore)
  })

  it('does not withdraw fees since less than threshold', async () => {
    if (ctx.withdrawRewardsMock) {
      expect(ctx.withdrawRewardsMock.calls.length).to.eq(0)
    }
  })
}

export function stakeDecreaseTests () {
  let ctx: any
  let feesBefore: BigNumber
  let oldPrinciple: BigNumber
  let tx: ContractTransaction
  let totalShares: BigNumber
  let dyBefore: BigNumber
  let swapStakeBalBefore: BigNumber

  before(async function () {
    ctx = this.test?.ctx
    feesBefore = await ctx.Tenderizer.pendingFees()
    oldPrinciple = await ctx.Tenderizer.currentPrincipal()
    dyBefore = await ctx.TenderSwap.calculateSwap(ctx.TenderToken.address, ONE)
    swapStakeBalBefore = await ctx.Steak.balanceOf(ctx.TenderSwap.address)
    tx = await ctx.Controller.rebase()
  })

  it('updates currentPrincipal', async () => {
    expect(await ctx.Tenderizer.currentPrincipal()).to.eq(ctx.expectedCP)
  })

  it('decreases tendertoken balances when slashed', async () => {
    // account 0
    const shares = await ctx.TenderToken.sharesOf(ctx.deployer)
    totalShares = await ctx.TenderToken.getTotalShares()
    expect(await ctx.TenderToken.balanceOf(ctx.deployer))
      .to.eq(sharesToTokens(shares, totalShares, await ctx.TenderToken.totalSupply()))
  })

  it("doesn't increase pending fees", async () => {
    expect(await ctx.Tenderizer.pendingFees()).to.eq(feesBefore)
  })

  it('decreases the tenderToken balance of the AMM', async () => {
    const shares = await ctx.TenderToken.sharesOf(ctx.TenderSwap.address)
    expect(await ctx.TenderToken.balanceOf(ctx.TenderSwap.address)).to.eq(sharesToTokens(shares, totalShares, await ctx.TenderToken.totalSupply()))
  })

  it('steak balance stays the same', async () => {
    expect(await ctx.Steak.balanceOf(ctx.TenderSwap.address)).to.eq(swapStakeBalBefore)
  })

  it('price of the TenderTokens increases vs the underlying', async () => {
    expect(await ctx.TenderSwap.calculateSwap(ctx.Steak.address, ONE)).to.be.gt(dyBefore)
  })

  it('should emit RewardsClaimed event from Tenderizer with 0 rewards and currentPrinciple', async () => {
    await expect(tx).to.emit(ctx.Tenderizer, 'RewardsClaimed').withArgs(ctx.expectedCP.sub(oldPrinciple), ctx.expectedCP, oldPrinciple)
  })
}
