import { BigNumber, Transaction } from 'ethers/lib/ethers'
import { expect } from 'chai'
import { ethers } from 'hardhat'

export default function suite () {
  let tx: Transaction
  let ctx: any
  const secondDeposit = ethers.utils.parseEther('10')
  const acceptableDelta = 2
  let balOtherAcc: BigNumber

  before(async function () {
    ctx = this.test?.ctx
    // Move tenderTokens from deployer/gov
    const govBalance = await ctx.TenderToken.balanceOf(ctx.deployer)
    await ctx.TenderToken.transfer(ctx.signers[3].address, govBalance)
    balOtherAcc = await ctx.TenderToken.balanceOf(ctx.signers[3].address)
  })

  before('stake with another account', async () => {
    await ctx.Steak.transfer(ctx.signers[2].address, secondDeposit)
    await ctx.Steak.connect(ctx.signers[2]).approve(ctx.Tenderizer.address, secondDeposit)
    await ctx.Tenderizer.connect(ctx.signers[2]).deposit(secondDeposit)
  })

  describe('user unlock', async () => {
    it('reverts if user does not have enough tender token balance', async () => {
      ctx.withdrawAmount = await ctx.TenderToken.balanceOf(ctx.signers[2].address)
      await expect(ctx.Tenderizer.connect(ctx.signers[2]).unstake(ctx.withdrawAmount.add(ethers.utils.parseEther('1'))))
        .to.be.revertedWith('BURN_AMOUNT_EXCEEDS_BALANCE')
    })

    it('on success - updates current pricinple', async () => {
      const principleBefore = await ctx.Tenderizer.currentPrincipal()
      tx = await ctx.Tenderizer.connect(ctx.signers[2]).unstake(ctx.withdrawAmount)
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

    it('should create unstakeLock', async () => {
      const lock = await ctx.Tenderizer.unstakeLocks(ctx.unbondLockID)
      expect(lock.account).to.eq(ctx.signers[2].address)
      expect(lock.amount.sub(ctx.withdrawAmount).abs()).to.lte(acceptableDelta)
    })

    it('should emit Unstake event from Tenderizer', async () => {
      expect(tx).to.emit(ctx.Tenderizer, 'Unstake')
        .withArgs(ctx.signers[2].address, ctx.NODE, ctx.withdrawAmount, ctx.unbondLockID)
    })
  })

  describe('gov unlock', async () => {
    it('reverts if unlock() reverts', async () => {
      ctx.unbondMock.function.will.revert()
      await expect(ctx.Tenderizer.unstake(ethers.utils.parseEther('0'))).to.be.reverted
    })

    it('unlock() suceeds', async () => {
      ctx.unbondMock.function.will.return()
      // Smocked doesn't actually execute transactions, so balance of Controller is not updated
      // hence manually transferring some tokens to simlaute withdrawal
      await ctx.Steak.transfer(ctx.Tenderizer.address, ctx.withdrawAmount)

      tx = await ctx.Tenderizer.unstake(ethers.utils.parseEther('0'))
      expect(ctx.unbondMock.function.calls.length).to.eq(1)
      expect(ctx.unbondMock.function.calls[0][ctx.unbondMock.nodeParam]).to.eq(ctx.NODE)
      expect(ctx.unbondMock.function.calls[0][ctx.unbondMock.amountParam]).to.eq(ctx.withdrawAmount)
    })

    it('should emit Unstake event from Tenderizer', async () => {
      expect(tx).to.emit(ctx.Tenderizer, 'Unstake')
        .withArgs(ctx.deployer, ctx.NODE, ctx.withdrawAmount, ctx.govUnboundLockID)
    })
  })
}