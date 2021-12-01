import { BigNumber, Transaction } from 'ethers/lib/ethers'
import { expect } from 'chai'
import { ethers } from 'hardhat'

export default function suite () {
  let tx: Transaction
  let ctx: any
  const secondDeposit = ethers.utils.parseEther('10')
  const acceptableDelta = 2

  before(async function () {
    ctx = this.test?.ctx
  })

  before('stake with another account', async () => {
    await ctx.Steak.transfer(ctx.signers[2].address, secondDeposit)
    await ctx.Steak.connect(ctx.signers[2]).approve(ctx.Controller.address, secondDeposit)
    await ctx.Controller.connect(ctx.signers[2]).deposit(secondDeposit)
  })

  describe('user unlock', async () => {
    it('reverts if user does not have enough tender token balance', async () => {
      ctx.withdrawAmount = await ctx.TenderToken.balanceOf(ctx.deployer)
      await expect(ctx.Controller.unlock(ctx.withdrawAmount.add(ethers.utils.parseEther('1'))))
        .to.be.revertedWith('BURN_AMOUNT_EXCEEDS_BALANCE')
    })

    it('on success - updates current pricinple', async () => {
      const principleBefore = await ctx.Tenderizer.currentPrincipal()
      tx = await ctx.Controller.unlock(ctx.withdrawAmount)
      expect(await ctx.Tenderizer.currentPrincipal()).to.eq(principleBefore.sub(ctx.withdrawAmount))
    })

    it('reduces TenderToken Balance', async () => {
      // lte to account for any roundoff error in tokenToShare calcualtion during burn
      expect(await ctx.TenderToken.balanceOf(ctx.deployer)).to.lte(acceptableDelta)
    })

    it('TenderToken balance of other account stays the same', async () => {
      const otherAccBal = await ctx.TenderToken.balanceOf(ctx.signers[2].address)
      expect(otherAccBal.sub(secondDeposit).abs()).to.lte(acceptableDelta)
    })

    it('should create unstakeLock', async () => {
      const lock = await ctx.Tenderizer.unstakeLocks(ctx.unbondLockID)
      expect(lock.account).to.eq(ctx.deployer)
      expect(lock.amount.sub(ctx.withdrawAmount).abs()).to.lte(acceptableDelta)
    })

    it('should emit Unstake event from Tenderizer', async () => {
      expect(tx).to.emit(ctx.Tenderizer, 'Unstake')
        .withArgs(ctx.deployer, ctx.NODE, ctx.withdrawAmount, ctx.unbondLockID)
    })
  })

  describe('gov unlock', async () => {
    it('reverts if requestUndelegateStake() reverts', async () => {
      ctx.unbondMock.function.will.revert()
      const txData = ethers.utils.arrayify(ctx.Tenderizer.interface.encodeFunctionData('unstake',
        [ctx.Controller.address, ethers.utils.parseEther('0')]))
      await expect(ctx.Controller.execute(ctx.Tenderizer.address, 0, txData)).to.be.reverted
    })

    it('requestUndelegateStake() suceeds', async () => {
      ctx.unbondMock.function.will.return()
      const txData = ethers.utils.arrayify(ctx.Tenderizer.interface.encodeFunctionData('unstake',
        [ctx.Controller.address, ethers.utils.parseEther('0')]))
      // Smocked doesn't actually execute transactions, so balance of Controller is not updated
      // hence manually transferring some tokens to simlaute withdrawal
      await ctx.Steak.transfer(ctx.Tenderizer.address, ctx.withdrawAmount)

      tx = await ctx.Controller.execute(ctx.Tenderizer.address, 0, txData)
      expect(ctx.unbondMock.function.calls.length).to.eq(1)
      expect(ctx.unbondMock.function.calls[0][ctx.unbondMock.nodeParam]).to.eq(ctx.NODE)
      expect(ctx.unbondMock.function.calls[0][ctx.unbondMock.amountParam]).to.eq(ctx.withdrawAmount)
    })

    it('should emit Unstake event from Tenderizer', async () => {
      expect(tx).to.emit(ctx.Tenderizer, 'Unstake')
        .withArgs(ctx.Controller.address, ctx.NODE, ctx.withdrawAmount, ctx.govUnboundLockID)
    })
  })
}
