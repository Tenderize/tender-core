import { ethers } from 'hardhat'
import { BigNumber, Transaction } from 'ethers/lib/ethers'
import { expect } from 'chai'

export default function suite () {
  let tx: Transaction
  let ctx: any
  let steakBalBefore : BigNumber
  let withdrawAmount : BigNumber

  before(async function () {
    ctx = this.test?.ctx
  })

  it('reverts if wihtdraw() reverts', async () => {
    ctx.withdrawMock.function.will.revert()
    await expect(ctx.Controller.withdraw(ctx.lockID)).to.be.reverted
  })

  it('withdraw() succeeds', async () => {
    ctx.withdrawMock.function.will.return()
    // Smocked doesn't actually execute transactions, so balance of Controller is not updated
    // hence manually transferring some tokens to simlaute withdrawal
    const lock = await ctx.Tenderizer.unstakeLocks(ctx.lockID)
    withdrawAmount = lock.amount
    await ctx.Steak.transfer(ctx.Tenderizer.address, withdrawAmount)
    steakBalBefore = await ctx.Steak.balanceOf(ctx.deployer)

    tx = await ctx.Controller.withdraw(ctx.lockID)
    expect(ctx.withdrawMock.function.calls.length).to.eq(1)
  })

  it('increases Steak balance', async () => {
    expect(await ctx.Steak.balanceOf(ctx.deployer))
      .to.eq(steakBalBefore.add(withdrawAmount))
  })

  it('should delete unstakeLock', async () => {
    const lock = await ctx.Tenderizer.unstakeLocks(ctx.lockID)
    expect(lock.account).to.eq(ethers.constants.AddressZero)
    expect(lock.amount).to.eq(0)
  })

  it('should emit Withdraw event from Tenderizer', async () => {
    expect(tx).to.emit(ctx.Tenderizer, 'Withdraw')
      .withArgs(ctx.deployer, withdrawAmount, ctx.lockID)
  })
}
