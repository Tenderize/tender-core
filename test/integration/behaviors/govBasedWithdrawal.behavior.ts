import { BigNumber } from '@ethersproject/bignumber'
import { ContractTransaction } from '@ethersproject/contracts'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { getSighash } from '../../util/helpers'
import { Context } from 'mocha'

export default function suite () {
  let ctx: Context
  const secondDeposit = ethers.utils.parseEther('10')
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
    let balBefore: BigNumber
    let tx: ContractTransaction
    beforeEach(async function () {
      // Gov Unstake
      await ctx.Tenderizer.processUnstake()
      balBefore = await ctx.Steak.balanceOf(ctx.Tenderizer.address)
      tx = await ctx.Tenderizer.processWithdraw(ctx.NODE)
    })

    it('reverts if undelegateStake() reverts', async () => {
      await ctx.StakingContract.setReverts(getSighash(ctx.StakingContract.interface, ctx.methods.withdrawStake), true)
      await expect(ctx.Tenderizer.processWithdraw(ctx.NODE)).to.be.reverted
      await ctx.StakingContract.setReverts(getSighash(ctx.StakingContract.interface, ctx.methods.withdrawStake), false)
    })

    it('undelegateStake() succeeds', async () => {
      const balAfter = await ctx.Steak.balanceOf(ctx.Tenderizer.address)
      expect(balBefore.add(ctx.withdrawAmount)).to.eq(balAfter)
    })

    it('should emit Withdraw event from Tenderizer', async () => {
      await expect(tx).to.emit(ctx.Tenderizer, 'ProcessWithdraws')
        .withArgs(ctx.deployer, ctx.withdrawAmount)
    })
  })

  describe('user withdrawal', async () => {
    let steakBalanceBefore: BigNumber
    let tx: ContractTransaction

    beforeEach(async function () {
      // Gov Unstake
      await ctx.Tenderizer.processUnstake()
      await ctx.Tenderizer.processWithdraw(ctx.NODE)
      steakBalanceBefore = await ctx.Steak.balanceOf(ctx.signers[2].address)
      tx = await ctx.Tenderizer.connect(ctx.signers[2]).withdraw(ctx.unbondLockID)
    })

    it('reverts if account mismatch from unbondigLock', async () => {
      await expect(ctx.Tenderizer.connect(ctx.signers[1]).withdraw(ctx.unbondLockID))
        .to.be.revertedWith('ACCOUNT_MISTMATCH')
    })

    it('success - increases Steak balance', async () => {
      expect(await ctx.Steak.balanceOf(ctx.signers[2].address))
        .to.eq(steakBalanceBefore.add(ctx.withdrawAmount))
    })

    it('should emit Withdraw event from Tenderizer', async () => {
      await expect(tx).to.emit(ctx.Tenderizer, 'Withdraw')
        .withArgs(ctx.signers[2].address, ctx.withdrawAmount, ctx.unbondLockID)
    })
  })

  describe('gov processes unstakes after being slashed', async function () {
    let steakBalanceBefore: BigNumber
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
      await ctx.Tenderizer.processWithdraw(ctx.NODE)
      slashFromWithdrawal = slashAmount.mul(ctx.withdrawAmount).div(cpBefore.add(ctx.withdrawAmount))
      steakBalanceBefore = await ctx.Steak.balanceOf(ctx.signers[2].address)
      await ctx.Tenderizer.connect(ctx.signers[2]).withdraw(ctx.unbondLockID)
    })

    it('reduces the unstaked amount', async () => {
      const expBalance = steakBalanceBefore.add(ctx.withdrawAmount).sub(slashFromWithdrawal)
      expect((await ctx.Steak.balanceOf(ctx.signers[2].address)).sub(expBalance).abs()).to.lte(acceptableDelta)
    })
  })

  describe('gov processes processes withdrawals after being slashed', async function () {
    let steakBalanceBefore: BigNumber
    let slashFromWithdrawal: BigNumber

    beforeEach(async function () {
      // Gov Unstake
      await ctx.Tenderizer.processUnstake()

      // reduce staked on mock
      const slashAmount = ethers.utils.parseEther('1')
      const staked = await ctx.StakingContract.staked()
      const cpBefore = await ctx.Tenderizer.totalStakedTokens()
      await ctx.StakingContract.setStaked(staked.sub(slashAmount))

      await ctx.Tenderizer.processWithdraw(ctx.NODE)
      await ctx.Tenderizer.claimRewards()
      slashFromWithdrawal = slashAmount.mul(ctx.withdrawAmount).div(cpBefore.add(this.withdrawAmount))
      steakBalanceBefore = await ctx.Steak.balanceOf(ctx.signers[2].address)
      await ctx.Tenderizer.connect(ctx.signers[2]).withdraw(ctx.unbondLockID)
    })

    it('reduces the unstaked amount', async () => {
      const expBalance = steakBalanceBefore.add(ctx.withdrawAmount).sub(slashFromWithdrawal)
      expect((await ctx.Steak.balanceOf(ctx.signers[2].address)).sub(expBalance).abs()).to.lte(acceptableDelta)
    })
  })

  describe('slash occurs after unstake is processed, reduces pending unstake locks', async function () {
    let steakBalanceBefore: BigNumber
    let slashFromWithdrawal: BigNumber

    beforeEach(async function () {
      // TODO: Add usntakes from other accounts
      // Gov Unstake
      await ctx.Tenderizer.processUnstake()
      await ctx.Tenderizer.processWithdraw(ctx.NODE)

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
