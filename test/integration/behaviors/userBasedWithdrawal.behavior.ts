import { ethers } from 'hardhat'
import { BigNumber, Transaction } from 'ethers/lib/ethers'
import { expect } from 'chai'

export default function suite () {
  let tx: Transaction
  let ctx: any
  let withdrawAmount : BigNumber

  before(async function () {
    ctx = this.test?.ctx
  })

  it('reverts if wihtdraw() reverts', async () => {
    ctx.withdrawMock.function.will.revert()
    await expect(ctx.Tenderizer.connect(ctx.signers[2]).withdraw(ctx.lockID)).to.be.reverted
  })

  it('withdraw() succeeds', async () => {
    ctx.withdrawMock.function.will.return()
    // Smocked doesn't actually execute transactions, so balance of Tenderizer is not updated
    // hence manually transferring some tokens to simlaute withdrawal
    const lock = await ctx.Tenderizer.unstakeLocks(ctx.lockID)
    withdrawAmount = lock.amount
    await ctx.Steak.transfer(ctx.Tenderizer.address, withdrawAmount)

    tx = await ctx.Tenderizer.connect(ctx.signers[2]).withdraw(ctx.lockID)
    expect(ctx.withdrawMock.function.calls.length).to.eq(1)
  })

  it('increases Steak balance', async () => {
    expect(await ctx.Steak.balanceOf(ctx.signers[2].address)).to.eq(withdrawAmount)
  })

  it('should delete unstakeLock', async () => {
    const lock = await ctx.Tenderizer.unstakeLocks(ctx.lockID)
    expect(lock.account).to.eq(ethers.constants.AddressZero)
    expect(lock.amount).to.eq(0)
  })

  it('should emit Withdraw event from Tenderizer', async () => {
    expect(tx).to.emit(ctx.Tenderizer, 'Withdraw')
      .withArgs(ctx.signers[2].address, withdrawAmount, ctx.lockID)
  })
}
