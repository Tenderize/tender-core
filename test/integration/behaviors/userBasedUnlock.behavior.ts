import { ethers } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, ContractTransaction } from 'ethers'

const acceptableDelta = 2

// For protocols where unlocks are tracked per user
export function userBasedUnlockByUser () {
  let ctx: any
  const acceptableDelta = 2
  const secondDeposit = ethers.utils.parseEther('10')
  let tx: ContractTransaction
  let withdrawAmount = ethers.utils.parseEther('0')

  before(async function () {
    ctx = this.test?.ctx
  })

  before('stake with another account', async () => {
    await ctx.Steak.transfer(ctx.signers[2].address, secondDeposit)
    await ctx.Steak.connect(ctx.signers[2]).approve(ctx.Controller.address, secondDeposit)
    await ctx.Controller.connect(ctx.signers[2]).deposit(secondDeposit)
  })

  it('reverts if unbond() reverts', async () => {
    ctx.unbondMock.function.will.revert()
    await expect(ctx.Controller.unlock(withdrawAmount)).to.be.reverted
  })

  it('reverts if requested amount exceeds balance', async () => {
    ctx.unbondMock.function.will.return()
    withdrawAmount = await ctx.TenderToken.balanceOf(ctx.deployer)
    await expect(ctx.Controller.unlock(withdrawAmount.add(ethers.utils.parseEther('1')))).to.be.revertedWith('BURN_AMOUNT_EXCEEDS_BALANCE')
  })

  it('reverts if requested amount is 0', async () => {
    await expect(ctx.Controller.unlock(ethers.constants.Zero)).to.be.revertedWith('ZERO_AMOUNT')
  })

  it('unbond() succeeds', async () => {
    tx = await ctx.Controller.unlock(withdrawAmount)
    expect(ctx.unbondMock.function.calls.length).to.eq(1)
    expect(ctx.unbondMock.function.calls[0][ctx.unbondMock.amountParam]).to.eq(withdrawAmount)
  })

  it('reduces ctx.TenderToken Balance', async () => {
    // lte to account for any roundoff error in tokenToShare calcualtion during burn
    expect(await ctx.TenderToken.balanceOf(ctx.deployer)).to.lte(acceptableDelta)
  })

  it('TenderToken balance of other account stays the same', async () => {
    const balOtherAcc = await ctx.TenderToken.balanceOf(ctx.signers[2].address)
    expect(balOtherAcc.sub(secondDeposit).abs()).to.lte(acceptableDelta)
  })

  it('should create unstakeLock', async () => {
    const lock = await ctx.Tenderizer.unstakeLocks(ctx.lockID)
    expect(lock.account).to.eq(ctx.deployer)
    expect(lock.amount).to.eq(withdrawAmount)
  })

  it('should emit Unstake event from Tenderizer', async () => {
    expect(tx).to.emit(ctx.Tenderizer, 'Unstake')
      .withArgs(ctx.deployer, ctx.NODE, withdrawAmount, ctx.lockID)
  })
}

export function govUnbondRevertIfNoStake () {
  let ctx: any
  before(async function () {
    ctx = this.test?.ctx
  })

  it('Gov unbond() reverts if no pending stake', async () => {
    const txData = ctx.Tenderizer.interface.encodeFunctionData('unstake', [ctx.Controller.address, ethers.utils.parseEther('0')])
    await expect(ctx.Controller.execute(ctx.Tenderizer.address, 0, txData)).to.be.revertedWith('ZERO_STAKE')
  })
}

// For protocols where unlocks are tracked per user
export function userBasedUnlockByGov () {
  let ctx: any

  before(async function () {
    ctx = this.test?.ctx
  })

  describe('Gov partial(half) unbond', async () => {
    let govWithdrawAmount: BigNumber
    let poolBalBefore: BigNumber
    let otherAccBalBefore: BigNumber
    before('perform partial unbond', async () => {
      poolBalBefore = await ctx.TenderToken.balanceOf(ctx.TenderSwap.address)
      otherAccBalBefore = await ctx.TenderToken.balanceOf(ctx.signers[2].address)
      const totalStaked = await ctx.Tenderizer.totalStakedTokens()
      govWithdrawAmount = totalStaked.div(2)
      const txData = ctx.Tenderizer.interface.encodeFunctionData('unstake',
        [ctx.Controller.address, govWithdrawAmount])
      // LivepeerMock.smocked.pendingStake.will.return.with(totalStaked)
      await ctx.Controller.execute(ctx.Tenderizer.address, 0, txData)
    })

    it('Gov unbond() succeeds', async () => {
      expect(ctx.unbondMock.function.calls.length).to.eq(1)
      expect(ctx.unbondMock.function.calls[0][ctx.unbondMock.amountParam]).to.eq(govWithdrawAmount)
    })

    it('TenderToken balance of other account halves', async () => {
      expect(await ctx.TenderToken.balanceOf(ctx.signers[2].address))
        .to.eq(otherAccBalBefore.div(2))
    })

    it('TenderToken balance of TenderSwap account halves', async () => {
      expect((await ctx.TenderToken.balanceOf(ctx.TenderSwap.address)).sub(poolBalBefore.div(2)).abs())
        .to.lte(acceptableDelta * 15)
    })
  })

  describe('Gov full unbond', async () => {
    let govWithdrawAmount: BigNumber
    before('perform full unbond', async () => {
      govWithdrawAmount = (await ctx.Tenderizer.totalStakedTokens())
      const txData = ctx.Tenderizer.interface.encodeFunctionData('unstake',
        [ctx.Controller.address, govWithdrawAmount])
      await ctx.Controller.execute(ctx.Tenderizer.address, 0, txData)
    })

    it('Gov unbond() succeeds', async () => {
      expect(ctx.unbondMock.function.calls.length).to.eq(1)
      expect(ctx.unbondMock.function.calls[0][ctx.unbondMock.amountParam]).to.eq(govWithdrawAmount)
    })

    it('TenderToken balance of other account becomes 0', async () => {
      expect(await ctx.TenderToken.balanceOf(ctx.signers[2].address)).to.eq(0)
    })

    it('TenderToken balance of TenderSwap account becomes 0', async () => {
      expect(await ctx.TenderToken.balanceOf(ctx.TenderSwap.address)).to.eq(0)
    })
  })
}
