import { BigNumber, Transaction } from 'ethers/lib/ethers'
import { expect } from 'chai'
import { ethers } from 'hardhat'

export default function suite () {
  let tx: Transaction
  let ctx: any

  before(async function () {
    ctx = this.test?.ctx
  })

  describe('gov withdrawal', async () => {
    it('user withdrawal reverts if gov withdrawal pending', async () => {
      await expect(ctx.Controller.withdraw(ctx.unbondLockID))
        .to.be.revertedWith('GOV_WITHDRAW_PENDING')
    })

    it('reverts if undelegateStake() reverts', async () => {
      ctx.withdrawMock.function.will.revert()
      const txData = ethers.utils.arrayify(ctx.Tenderizer.interface.encodeFunctionData('withdraw',
        [ctx.Controller.address, ctx.govUnboundLockID]))
      await expect(ctx.Controller.execute(ctx.Tenderizer.address, 0, txData)).to.be.reverted
    })

    it('undelegateStake() succeeds', async () => {
      ctx.withdrawMock.function.will.return()
      const txData = ethers.utils.arrayify(ctx.Tenderizer.interface.encodeFunctionData('withdraw',
        [ctx.Controller.address, ctx.govUnboundLockID]))
      tx = await ctx.Controller.execute(ctx.Tenderizer.address, 0, txData)
      expect(ctx.withdrawMock.function.calls.length).to.eq(1)
    })

    it('should emit Withdraw event from Tenderizer', async () => {
      expect(tx).to.emit(ctx.Tenderizer, 'Withdraw')
        .withArgs(ctx.Controller.address, ctx.withdrawAmount, ctx.govUnboundLockID)
    })
  })

  describe('user withdrawal', async () => {
    let steakBalanceBefore : BigNumber
    it('reverts if account mismatch from unboondigLock', async () => {
      await expect(ctx.Controller.connect(ctx.signers[1]).withdraw(ctx.unbondLockID))
        .to.be.revertedWith('ACCOUNT_MISTMATCH')
    })

    it('success - increases AUDIO balance', async () => {
      steakBalanceBefore = await ctx.Steak.balanceOf(ctx.deployer)
      tx = await ctx.Controller.withdraw(ctx.unbondLockID)
      expect(await ctx.Steak.balanceOf(ctx.deployer))
        .to.eq(steakBalanceBefore.add(ctx.withdrawAmount))
    })

    it('should delete unstakeLock', async () => {
      const lock = await ctx.Tenderizer.unstakeLocks(ctx.unbondLockID)
      expect(lock.account).to.eq(ethers.constants.AddressZero)
      expect(lock.amount).to.eq(0)
    })

    it('should emit Withdraw event from Tenderizer', async () => {
      expect(tx).to.emit(ctx.Tenderizer, 'Withdraw')
        .withArgs(ctx.deployer, ctx.withdrawAmount, ctx.unbondLockID)
    })
  })
}
