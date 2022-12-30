import { ethers } from 'hardhat'
import { BigNumber } from '@ethersproject/bignumber'
import { ContractTransaction } from '@ethersproject/contracts'
import { expect } from 'chai'
import { getSighash } from '../../util/helpers'
import { Context } from 'mocha'

const secondDeposit = ethers.utils.parseEther('10')

export default function suite() {
  let tx: ContractTransaction
  let ctx: Context

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

    it('reverts if requested from the wrong account', async () => {
      await expect(ctx.Tenderizer.connect(ctx.signers[1]).withdraw(ctx.lockID)).to.be.revertedWith('ACCOUNT_MISTMATCH')
    })

    it('increases Steak balance', async () => {
      expect(balAfter.sub(balBefore)).to.eq(secondDeposit)
    })

    it('should emit Withdraw event from Tenderizer', async () => {
      expect(tx).to.emit(ctx.Tenderizer, 'Withdraw')
        .withArgs(ctx.signers[2].address, secondDeposit, ctx.lockID)
    })

    it('Withdraws correct amount in case of slashing', async () => {
      switch (ctx.NAME) {
        case ('matic'): break
        default: return
      }
      const deposit = ethers.utils.parseEther('100')
      await ctx.Steak.transfer(ctx.signers[4].address, deposit)
      const TenderizerWithSigner = ctx.Tenderizer.connect(ctx.signers[4])
      await ctx.Steak.connect(ctx.signers[4]).approve(TenderizerWithSigner.address, deposit)
      await TenderizerWithSigner.deposit(deposit)
      await TenderizerWithSigner.unstake(deposit)
      ctx.StakingContract.changePendingUndelegation(1, deposit.div(2))

      const balBefore = await ctx.Steak.balanceOf(ctx.signers[4].address)
      const tx = await TenderizerWithSigner.withdraw(1)

      const balAfter = await ctx.Steak.balanceOf(ctx.signers[4].address)
      expect(balAfter.sub(balBefore)).to.eq(deposit.div(2))
    })
  })
}
