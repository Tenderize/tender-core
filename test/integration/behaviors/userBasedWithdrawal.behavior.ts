import { ethers } from 'hardhat'
import { BigNumber, Transaction } from 'ethers/lib/ethers'
import { expect } from 'chai'
import { getSighash } from '../../util/helpers'

export default function suite () {
  let tx: Transaction
  let ctx: any
  let withdrawAmount : BigNumber

  before(async function () {
    ctx = this.test?.ctx
  })

  it('reverts if wihtdraw() reverts', async () => {
    await ctx.StakingContract.setReverts(getSighash(ctx.StakingContract.interface, 'withdrawStake'), true)
    await expect(ctx.Tenderizer.connect(ctx.signers[2]).withdraw(ctx.lockID)).to.be.reverted
    await ctx.StakingContract.setReverts(getSighash(ctx.StakingContract.interface, 'withdrawStake'), false)
  })

  it('withdraw() succeeds', async () => {
    const lock = await ctx.Tenderizer.unstakeLocks(ctx.lockID)
    withdrawAmount = lock.amount
    tx = await (ctx.Tenderizer.connect(ctx.signers[2])).withdraw(ctx.lockID)
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
