import { ethers } from 'hardhat'
import { BigNumber, Transaction } from 'ethers/lib/ethers'
import { expect } from 'chai'
import { getSighash } from '../../util/helpers'
import { Context } from 'mocha'

const secondDeposit = ethers.utils.parseEther('10')

export default function suite () {
  let tx: Transaction
  let ctx: Context
  let withdrawAmount : BigNumber

  let balBefore: BigNumber
  let balAfter: BigNumber

  describe('withdraw() reverts', async function () {
    beforeEach(async function () {
      ctx = this.test?.ctx!
    })

    it('tenderizer.wihtdraw() also reverts', async () => {
      await ctx.StakingContract.setReverts(getSighash(ctx.StakingContract.interface, ctx.methods.withdrawStake), true)
      await expect(ctx.Tenderizer.connect(ctx.signers[2]).withdraw(ctx.lockID)).to.be.reverted
      await ctx.StakingContract.setReverts(getSighash(ctx.StakingContract.interface, ctx.methods.withdrawStake), false)
    })
  })

  describe('withdraw() succeeds', async function () {
    beforeEach(async function () {
      ctx = this.test?.ctx!

      await ctx.Steak.transfer(ctx.signers[2].address, secondDeposit)
      await ctx.Steak.connect(ctx.signers[2]).approve(ctx.Tenderizer.address, secondDeposit)
      await ctx.Tenderizer.connect(ctx.signers[2]).deposit(secondDeposit)
      await ctx.Tenderizer.claimRewards()

      await ctx.Tenderizer.connect(ctx.signers[2]).unstake(secondDeposit)

      balBefore = await ctx.Steak.balanceOf(ctx.signers[2].address)
      tx = await ctx.Tenderizer.connect(ctx.signers[2]).withdraw(ctx.lockID)
      balAfter = await ctx.Steak.balanceOf(ctx.signers[2].address)
    })

    it('increases Steak balance', async () => {
      expect(balAfter.sub(balBefore)).to.eq(secondDeposit)
    })

    it('should delete unstakeLock', async () => {
      const lock = await ctx.Tenderizer.unstakeLocks(ctx.lockID)
      expect(lock.account).to.eq(ethers.constants.AddressZero)
      expect(lock.amount).to.eq(0)
    })

    it('should emit Withdraw event from Tenderizer', async () => {
      expect(tx).to.emit(ctx.Tenderizer, 'Withdraw')
        .withArgs(ctx.signers[2].address, secondDeposit, ctx.lockID)
    })

    it('Withdraws correct amount in case of slashing', async () => {
      switch (ctx.NAME) {
        case ('matic'): break
        default:return
      }
      const deposit = ethers.utils.parseEther('100')
      await ctx.Steak.transfer(ctx.signers[4].address, deposit)
      const Tenderizer_ = ctx.Tenderizer.connect(ctx.signers[4])
      await ctx.Steak.connect(ctx.signers[4]).approve(Tenderizer_.address, deposit)
      await Tenderizer_.deposit(deposit)
      await Tenderizer_.unstake(deposit)
      ctx.StakingContract.changePendingUndelegation(1, deposit.div(2))

      const balBefore = await ctx.Steak.balanceOf(ctx.signers[4].address)
      await Tenderizer_.withdraw(1)
      const balAfter = await ctx.Steak.balanceOf(ctx.signers[4].address)
      expect(balAfter.sub(balBefore)).to.eq(deposit.div(2))
    })
  })
}
