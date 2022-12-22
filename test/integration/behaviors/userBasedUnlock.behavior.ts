import { ethers } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, ContractTransaction, Transaction } from 'ethers'
import { getSighash } from '../../util/helpers'
import { Context } from 'mocha'

const secondDeposit = ethers.utils.parseEther('10')

// For protocols where unlocks are tracked per user
export function userBasedUnlockByUser() {
  describe('unbond() reverts', async function () {
    let ctx: Context
    beforeEach(async function () {
      ctx = this.test?.ctx!
    })
    it('unstake also reverts', async () => {
      await ctx.StakingContract.setReverts(getSighash(ctx.StakingContract.interface, ctx.methods.unstake), true)
      await expect(ctx.Tenderizer.connect(ctx.signers[2]).unstake(1)).to.be.reverted
      await ctx.StakingContract.setReverts(getSighash(ctx.StakingContract.interface, ctx.methods.unstake), false)
    })
  })

  describe('unbond() succeeds', async function () {
    let ctx: Context
    const acceptableDelta = 2
    let tx: ContractTransaction
    let withdrawAmount: BigNumber
    let balOtherAcc: BigNumber
    let stakedBefore: BigNumber
    let cpBefore: BigNumber

    beforeEach(async function () {
      ctx = this.test?.ctx!
      // Move tenderTokens from deployer/gov
      const govBalance = await ctx.TenderToken.balanceOf(ctx.deployer)
      await ctx.TenderToken.transfer(ctx.signers[3].address, govBalance)
      balOtherAcc = await ctx.TenderToken.balanceOf(ctx.signers[3].address)

      await ctx.Steak.transfer(ctx.signers[2].address, secondDeposit)
      await ctx.Steak.connect(ctx.signers[2]).approve(ctx.Tenderizer.address, secondDeposit)
      await ctx.Tenderizer.connect(ctx.signers[2]).deposit(secondDeposit)
      await ctx.Tenderizer.claimRewards()

      stakedBefore = await ctx.StakingContract.staked()
      cpBefore = await ctx.Tenderizer.totalStakedTokens()
      withdrawAmount = await ctx.TenderToken.balanceOf(ctx.signers[2].address)
      tx = await ctx.Tenderizer.connect(ctx.signers[2]).unstake(withdrawAmount)
    })

    it('reverts if requested amount exceeds balance', async () => {
      withdrawAmount = await ctx.TenderToken.balanceOf(ctx.signers[2].address)
      await expect(ctx.Tenderizer.connect(ctx.signers[2]).unstake(withdrawAmount.add(ethers.utils.parseEther('1')))).to.be.revertedWith('BURN_AMOUNT_EXCEEDS_BALANCE')
    })

    it('reverts if requested amount is 0', async () => {
      await expect(ctx.Tenderizer.connect(ctx.signers[2]).unstake(ethers.constants.Zero)).to.be.revertedWith('ZERO_AMOUNT')
    })

    it('unbond() succeeds', async () => {
      expect(stakedBefore.sub(withdrawAmount)).to.eq(await ctx.StakingContract.staked())
      expect(cpBefore.sub(withdrawAmount)).to.eq(await ctx.Tenderizer.totalStakedTokens())
    })

    it('reduces TenderToken Balance', async () => {
      // lte to account for any roundoff error in tokenToShare calcualtion during burn
      expect(await ctx.TenderToken.balanceOf(ctx.signers[2].address)).to.lte(acceptableDelta)
    })

    it('TenderToken balance of other account stays the same', async () => {
      expect(balOtherAcc.sub(await ctx.TenderToken.balanceOf(ctx.signers[3].address)).abs()).to.lte(acceptableDelta)
    })

    it('should emit Unstake event from Tenderizer', async () => {
      await expect(tx).to.emit(ctx.Tenderizer, 'Unstake')
        .withArgs(ctx.signers[2].address, ctx.NODE, withdrawAmount, ctx.lockID)
    })
  })
}

export function rescueFunctions() {
  let tx: Transaction
  let ctx: Context
  let principleBefore: BigNumber

  beforeEach(async function () {
    ctx = this.test?.ctx!
    await ctx.Tenderizer.claimRewards()
  })

  describe('rescue unstake', async () => {
    beforeEach(async function () {
      principleBefore = await ctx.Tenderizer.currentPrincipal()
      tx = await ctx.Tenderizer.rescueUnlock()
    })

    it('reverts if not called by gov', async () => {
      await expect(ctx.Tenderizer.connect(ctx.signers[1]).rescueWithdraw(ctx.lockID)).to.be.reverted
    })

    it('current principle stays the same', async () => {
      expect(await ctx.Tenderizer.currentPrincipal()).to.eq(principleBefore)
    })

    it('should emit Unstake event from Tenderizer', async () => {
      expect(tx).to.emit(ctx.Tenderizer, 'Unstake')
        .withArgs(ctx.Tenderizer.address, ctx.NODE, principleBefore, ctx.lockID)
    })
  })

  describe('rescue withdraw', async () => {
    beforeEach(async function () {
      principleBefore = await ctx.Tenderizer.currentPrincipal()
      await ctx.Tenderizer.rescueUnlock()
      tx = await ctx.Tenderizer.rescueWithdraw(ctx.lockID)
    })

    it('reverts if not called by gov', async () => {
      await expect(ctx.Tenderizer.connect(ctx.signers[1]).rescueWithdraw(ctx.lockID)).to.be.reverted
    })

    it('success - increases Steak balance', async () => {
      expect(await ctx.Steak.balanceOf(ctx.Tenderizer.address))
        .to.eq(principleBefore)
    })

    it('should emit Withdraw event from Tenderizer', async () => {
      expect(tx).to.emit(ctx.Tenderizer, 'Withdraw')
        .withArgs(ctx.Tenderizer.address, principleBefore, ctx.lockID)
    })
  })
}
