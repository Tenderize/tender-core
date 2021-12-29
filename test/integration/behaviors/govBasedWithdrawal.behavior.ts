import { BigNumber, Transaction } from 'ethers/lib/ethers'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { getSighash } from '../../util/helpers'

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
      await ctx.StakingContract.setReverts(getSighash(ctx.StakingContract.interface, ctx.methods.withdrawStake), true)
      await expect(ctx.Tenderizer.withdraw(ctx.govUnboundLockID)).to.be.reverted
      await ctx.StakingContract.setReverts(getSighash(ctx.StakingContract.interface, ctx.methods.withdrawStake), false)
    })

    it('undelegateStake() succeeds', async () => {
      const balBefore = await ctx.Steak.balanceOf(ctx.Tenderizer.address)
      tx = await ctx.Tenderizer.withdraw(ctx.govUnboundLockID)
      const balAfter = await ctx.Steak.balanceOf(ctx.Tenderizer.address)
      expect(balBefore.add(ctx.withdrawAmount)).to.eq(balAfter)
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
