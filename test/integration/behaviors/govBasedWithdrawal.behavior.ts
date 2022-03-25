import { BigNumber, Transaction } from 'ethers/lib/ethers'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { getSighash } from '../../util/helpers'
import { Context } from 'mocha'

export default function suite () {
  let tx: Transaction
  let ctx: Context
  const secondDeposit = ethers.utils.parseEther('10')
  let balBefore: BigNumber
  const acceptableDelta = 2

  beforeEach(async function () {
    ctx = this.test?.ctx!
    // Stake and unstake with another account
    await ctx.Steak.transfer(ctx.signers[2].address, secondDeposit)
    await ctx.Steak.connect(ctx.signers[2]).approve(ctx.Tenderizer.address, secondDeposit)
    await ctx.Tenderizer.connect(ctx.signers[2]).deposit(secondDeposit)
    await ctx.Tenderizer.claimRewards()
    ctx.withdrawAmount = await ctx.TenderToken.balanceOf(ctx.signers[2].address)
    await ctx.Tenderizer.connect(ctx.signers[2]).unstake(ctx.withdrawAmount)
  })

  it('user withdrawal reverts if gov withdrawal pending', async () => {
    await expect(ctx.Tenderizer.connect(ctx.signers[2]).withdraw(ctx.unbondLockID))
      .to.be.revertedWith('ONGOING_UNLOCK')
  })

  describe('gov withdrawal', async () => {
    beforeEach(async function () {
      // Gov Unstake
      await ctx.Tenderizer.processUnstake()
      balBefore = await ctx.Steak.balanceOf(ctx.Tenderizer.address)
      tx = await ctx.Tenderizer.processWithdraw()
    })

    it('reverts if undelegateStake() reverts', async () => {
      await ctx.StakingContract.setReverts(getSighash(ctx.StakingContract.interface, ctx.methods.withdrawStake), true)
      await expect(ctx.Tenderizer.processWithdraw()).to.be.reverted
      await ctx.StakingContract.setReverts(getSighash(ctx.StakingContract.interface, ctx.methods.withdrawStake), false)
    })

    it('undelegateStake() succeeds', async () => {
      const balAfter = await ctx.Steak.balanceOf(ctx.Tenderizer.address)
      expect(balBefore.add(ctx.withdrawAmount)).to.eq(balAfter)
    })

    it('should emit Withdraw event from Tenderizer', async () => {
      expect(tx).to.emit(ctx.Tenderizer, 'ProcessWithdraws')
        .withArgs(ctx.deployer, ctx.withdrawAmount)
    })
  })

  describe('user withdrawal', async () => {
    let steakBalanceBefore : BigNumber

    beforeEach(async function () {
      // Gov Unstake
      await ctx.Tenderizer.processUnstake()
      await ctx.Tenderizer.processWithdraw()
      steakBalanceBefore = await ctx.Steak.balanceOf(ctx.signers[2].address)
      tx = await ctx.Tenderizer.connect(ctx.signers[2]).withdraw(ctx.unbondLockID)
    })

    it('reverts if account mismatch from unboondigLock', async () => {
      await expect(ctx.Tenderizer.connect(ctx.signers[1]).withdraw(ctx.unbondLockID))
        .to.be.revertedWith('ACCOUNT_MISTMATCH')
    })

    it('success - increases Steak balance', async () => {
      expect(await ctx.Steak.balanceOf(ctx.signers[2].address))
        .to.eq(steakBalanceBefore.add(ctx.withdrawAmount))
    })

    it('should emit Withdraw event from Tenderizer', async () => {
      expect(tx).to.emit(ctx.Tenderizer, 'Withdraw')
        .withArgs(ctx.signers[2].address, ctx.withdrawAmount, ctx.unbondLockID)
    })
  })

  describe('negative rebase before gov processes unstakes', async function () {
    let steakBalanceBefore : BigNumber
    let slashFromWithdrawal: BigNumber

    beforeEach(async function () {
      // reduce staked on mock
      const slashAmount = ethers.utils.parseEther('1')
      const staked = await ctx.StakingContract.staked()
      await ctx.StakingContract.setStaked(staked.sub(slashAmount))
      const cpBefore = await ctx.Tenderizer.totalStakedTokens()
      await ctx.Tenderizer.claimRewards()

      // Gov Unstake
      await ctx.Tenderizer.processUnstake()
      await ctx.Tenderizer.processWithdraw()
      slashFromWithdrawal = slashAmount.mul(ctx.withdrawAmount).div(cpBefore.add(ctx.withdrawAmount))
      steakBalanceBefore = await ctx.Steak.balanceOf(ctx.signers[2].address)
      await ctx.Tenderizer.connect(ctx.signers[2]).withdraw(ctx.unbondLockID)
    })

    it('reduces the unstaked amount', async () => {
      const expBalance = steakBalanceBefore.add(ctx.withdrawAmount).sub(slashFromWithdrawal)
      expect((await ctx.Steak.balanceOf(ctx.signers[2].address)).sub(expBalance).abs()).to.lte(acceptableDelta)
    })
  })

  describe('negative rebase after gov processes unstakes', async function () {
    let steakBalanceBefore : BigNumber
    let slashFromWithdrawal: BigNumber

    beforeEach(async function () {
      // Gov Unstake
      await ctx.Tenderizer.processUnstake()
      // reduce staked on mock
      const slashAmount = ethers.utils.parseEther('1')
      const staked = await ctx.StakingContract.staked()
      const cpBefore = await ctx.Tenderizer.totalStakedTokens()
      await ctx.StakingContract.setStaked(staked.sub(slashAmount))

      await ctx.Tenderizer.processWithdraw()
      await ctx.Tenderizer.claimRewards()
      slashFromWithdrawal = slashAmount.mul(ctx.withdrawAmount).div(cpBefore.add(ctx.withdrawAmount))
      steakBalanceBefore = await ctx.Steak.balanceOf(ctx.signers[2].address)
      await ctx.Tenderizer.connect(ctx.signers[2]).withdraw(ctx.unbondLockID)
    })

    it('reduces the unstaked amount', async () => {
      const expBalance = steakBalanceBefore.add(ctx.withdrawAmount).sub(slashFromWithdrawal)
      expect((await ctx.Steak.balanceOf(ctx.signers[2].address)).sub(expBalance).abs()).to.lte(acceptableDelta)
    })
  })

  describe('negative rebase after gov processes withdraws', async function () {
    let steakBalanceBefore : BigNumber
    let slashFromWithdrawal: BigNumber

    beforeEach(async function () {
      // TODO: Add usntakes from other accounts
      // Gov Unstake
      await ctx.Tenderizer.processUnstake()
      await ctx.Tenderizer.processWithdraw()
      // reduce staked on mock
      const slashAmount = ethers.utils.parseEther('1')
      const staked = await ctx.StakingContract.staked()
      await ctx.StakingContract.setStaked(staked.sub(slashAmount))
      const cpBefore = await ctx.Tenderizer.totalStakedTokens()
      await ctx.Tenderizer.claimRewards()
      slashFromWithdrawal = slashAmount.mul(ctx.withdrawAmount).div(cpBefore.add(ctx.withdrawAmount))
      steakBalanceBefore = await ctx.Steak.balanceOf(ctx.signers[2].address)
      await ctx.Tenderizer.connect(ctx.signers[2]).withdraw(ctx.unbondLockID)
    })

    it('reduces the unstaked amount', async () => {
      const expBalance = steakBalanceBefore.add(ctx.withdrawAmount).sub(slashFromWithdrawal)
      expect((await ctx.Steak.balanceOf(ctx.signers[2].address)).sub(expBalance).abs()).to.lte(acceptableDelta)
    })
  })
}
