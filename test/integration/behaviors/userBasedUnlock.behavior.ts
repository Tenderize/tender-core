import { ethers } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, ContractTransaction } from 'ethers'
import { getSighash } from '../../util/helpers'
import { Context } from 'mocha'

const secondDeposit = ethers.utils.parseEther('10')

// For protocols where unlocks are tracked per user
export function userBasedUnlockByUser () {
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
    expect(tx).to.emit(ctx.Tenderizer, 'Unstake')
      .withArgs(ctx.signers[2].address, ctx.NODE, withdrawAmount, ctx.lockID)
  })
})
}

export function govUnbondRevertIfNoStake () {
  let ctx: Context
  before(async function () {
    ctx = this.test?.ctx!
  })

  it('Gov unbond() reverts if no pending stake', async () => {
    await expect(ctx.Tenderizer.unstake(ethers.utils.parseEther('0'))).to.be.revertedWith('ZERO_STAKE')
  })
}

// For protocols where unlocks are tracked per user
export function userBasedUnlockByGov () {
  let ctx: Context
  let tx: any

  describe('Gov partial(half) unbond', async () => {
    let govWithdrawAmount: BigNumber
    let poolBalBefore: BigNumber
    let otherAccBalBefore: BigNumber
    let stakedBefore: BigNumber
    let cpBefore: BigNumber
    beforeEach('perform partial unbond', async function () {
      ctx = this.test?.ctx!

      await ctx.Steak.transfer(ctx.signers[2].address, secondDeposit)
      await ctx.Steak.connect(ctx.signers[2]).approve(ctx.Tenderizer.address, secondDeposit)
      await ctx.Tenderizer.connect(ctx.signers[2]).deposit(secondDeposit)
      await ctx.Tenderizer.claimRewards()

      poolBalBefore = await ctx.TenderToken.balanceOf(ctx.TenderSwap.address)
      otherAccBalBefore = await ctx.TenderToken.balanceOf(ctx.signers[2].address)
      cpBefore = await ctx.Tenderizer.totalStakedTokens()
      govWithdrawAmount = cpBefore.div(2)

      stakedBefore = await ctx.StakingContract.staked()
      tx = await ctx.Tenderizer.unstake(govWithdrawAmount)
    })

    it('Gov unbond() succeeds', async () => {
      expect(stakedBefore.sub(govWithdrawAmount)).to.eq(await ctx.StakingContract.staked())
      expect(cpBefore.sub(govWithdrawAmount)).to.eq(await ctx.Tenderizer.totalStakedTokens())
    })

    it('TenderToken balance of other account halves', async () => {
      expect(await ctx.TenderToken.balanceOf(ctx.signers[2].address))
        .to.eq(otherAccBalBefore.div(2))
    })

    it('TenderToken balance of TenderSwap account halves', async () => {
      expect(await ctx.TenderToken.balanceOf(ctx.TenderSwap.address))
        .to.eq(poolBalBefore.div(2))
    })
  })

  describe('Gov full unbond', async () => {
    let govWithdrawAmount: BigNumber
    beforeEach('perform full unbond', async () => {
      govWithdrawAmount = (await ctx.Tenderizer.totalStakedTokens())
      tx = await ctx.Tenderizer.unstake(govWithdrawAmount)
    })

    it('Gov unbond() succeeds', async () => {
      expect(ethers.constants.Zero).to.eq(await ctx.StakingContract.staked())
      expect(ethers.constants.Zero).to.eq(await ctx.Tenderizer.totalStakedTokens())
    })

    it('TenderToken balance of other account becomes 0', async () => {
      expect(await ctx.TenderToken.balanceOf(ctx.signers[2].address)).to.eq(0)
    })

    it('TenderToken balance of TenderSwap account becomes 0', async () => {
      expect(await ctx.TenderToken.balanceOf(ctx.TenderSwap.address)).to.eq(0)
    })
  })
}
