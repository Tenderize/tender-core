import { BigNumber, Transaction } from 'ethers/lib/ethers'
import { expect } from 'chai'
import { ethers } from 'hardhat'

export default function suite () {
  let tx: Transaction
  let ctx: any

  before(async function () {
    ctx = this.test?.ctx
    const lock = await ctx.Tenderizer.unstakeLocks(ctx.unbondLockID)
    ctx.withdrawAmount = lock.amount
  })

  describe('gov withdrawal', async () => {
    it('user withdrawal reverts if gov withdrawal pending', async () => {
      await expect(ctx.Tenderizer.connect(ctx.signers[2]).withdraw(ctx.unbondLockID))
        .to.be.revertedWith('GOV_WITHDRAW_PENDING')
    })

    it('reverts if undelegateStake() reverts', async () => {
      ctx.withdrawMock.function.will.revert()
      await expect(ctx.Tenderizer.withdraw(ctx.govUnboundLockID)).to.be.reverted
    })

    it('undelegateStake() succeeds', async () => {
      ctx.withdrawMock.function.will.return()
      tx = await ctx.Tenderizer.withdraw(ctx.govUnboundLockID)
      expect(ctx.withdrawMock.function.calls.length).to.eq(1)
    })

    it('should emit Withdraw event from Tenderizer', async () => {
      expect(tx).to.emit(ctx.Tenderizer, 'Withdraw')
        .withArgs(ctx.deployer, ctx.withdrawAmount, ctx.govUnboundLockID)
    })
  })

  describe('user withdrawal', async () => {
    let steakBalanceBefore : BigNumber
    it('reverts if account mismatch from unboondigLock', async () => {
      await expect(ctx.Tenderizer.connect(ctx.signers[1]).withdraw(ctx.unbondLockID))
        .to.be.revertedWith('ACCOUNT_MISTMATCH')
    })

    it('success - increases Steak balance', async () => {
      steakBalanceBefore = await ctx.Steak.balanceOf(ctx.signers[2].address)
      tx = await ctx.Tenderizer.connect(ctx.signers[2]).withdraw(ctx.unbondLockID)
      expect(await ctx.Steak.balanceOf(ctx.signers[2].address))
        .to.eq(steakBalanceBefore.add(ctx.withdrawAmount))
    })

    it('should delete unstakeLock', async () => {
      const lock = await ctx.Tenderizer.unstakeLocks(ctx.unbondLockID)
      expect(lock.account).to.eq(ethers.constants.AddressZero)
      expect(lock.amount).to.eq(0)
    })

    it('should emit Withdraw event from Tenderizer', async () => {
      expect(tx).to.emit(ctx.Tenderizer, 'Withdraw')
        .withArgs(ctx.signers[2].address, ctx.withdrawAmount, ctx.unbondLockID)
    })
  })
}
