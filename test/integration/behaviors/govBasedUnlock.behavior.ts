import { BigNumber, Transaction } from 'ethers/lib/ethers'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { getSighash } from '../../util/helpers'
import { Context } from 'mocha'

export default function suite () {
  let unstakeTx: Transaction
  let processUnstakeTx: Transaction
  let ctx: Context
  const secondDeposit = ethers.utils.parseEther('10')
  const acceptableDelta = 2
  let balOtherAcc: BigNumber
  let principleBefore: BigNumber

  beforeEach(async function () {
    ctx = this.test?.ctx!
    // Stake with another account
    await ctx.Steak.transfer(ctx.signers[2].address, secondDeposit)
    await ctx.Steak.connect(ctx.signers[2]).approve(ctx.Tenderizer.address, secondDeposit)
    await ctx.Tenderizer.connect(ctx.signers[2]).deposit(secondDeposit)

    // Move tenderTokens from deployer/gov
    const govBalance = await ctx.TenderToken.balanceOf(ctx.deployer)
    await ctx.TenderToken.transfer(ctx.signers[3].address, govBalance)
    balOtherAcc = await ctx.TenderToken.balanceOf(ctx.signers[3].address)

    principleBefore = await ctx.Tenderizer.currentPrincipal()
    ctx.withdrawAmount = await ctx.TenderToken.balanceOf(ctx.signers[2].address)
    unstakeTx = await ctx.Tenderizer.connect(ctx.signers[2]).unstake(ctx.withdrawAmount)
  })

  describe('user unlock', async () => {
    it('reverts if user does not have enough tender token balance', async () => {
      await expect(ctx.Tenderizer.connect(ctx.signers[2]).unstake(ctx.withdrawAmount.add(ethers.utils.parseEther('1'))))
        .to.be.revertedWith('BURN_AMOUNT_EXCEEDS_BALANCE')
    })

    it('on success - updates current pricinple', async () => {
      expect(await ctx.Tenderizer.currentPrincipal()).to.eq(principleBefore.sub(ctx.withdrawAmount))
    })

    it('reduces TenderToken Balance', async () => {
      // lte to account for any roundoff error in tokenToShare calcualtion during burn
      expect(await ctx.TenderToken.balanceOf(ctx.signers[2].address)).to.lte(acceptableDelta)
    })

    it('TenderToken balance of other account stays the same', async () => {
      expect((await ctx.TenderToken.balanceOf(ctx.signers[3].address)).sub(balOtherAcc).abs())
        .to.lte(acceptableDelta)
    })

    it('should emit Unstake event from Tenderizer', async () => {
      expect(unstakeTx).to.emit(ctx.Tenderizer, 'Unstake')
        .withArgs(ctx.signers[2].address, ctx.NODE, ctx.withdrawAmount, ctx.unbondLockID)
    })
  })

  describe('gov unlock', async () => {
    it('reverts if unlock() reverts', async () => {
      await ctx.StakingContract.setReverts(getSighash(ctx.StakingContract.interface, ctx.methods.unstake), true)
      await expect(ctx.Tenderizer.processUnstake()).to.be.reverted
      await ctx.StakingContract.setReverts(getSighash(ctx.StakingContract.interface, ctx.methods.unstake), false)
    })

    it('unlock() suceeds', async () => {
      const stakeBefore = await ctx.Tenderizer.totalStakedTokens()

      processUnstakeTx = await ctx.Tenderizer.processUnstake()

      // staked tokens already updated by user unstaked, gov unstake just processes
      // user unstakes, so staked tokens stays the same
      expect(stakeBefore).to.eq(await ctx.Tenderizer.totalStakedTokens())
    })

    it('should emit ProcessUnstakes event from Tenderizer', async () => {
      expect(processUnstakeTx).to.emit(ctx.Tenderizer, 'ProcessUnstakes')
        .withArgs(ctx.deployer, ctx.NODE, ctx.withdrawAmount)
    })
  })
}
