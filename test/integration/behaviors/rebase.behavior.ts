import { BigNumber, ContractTransaction, Transaction } from 'ethers/lib/ethers'
import { ethers } from 'hardhat'
import { expect } from 'chai'
import { sharesToTokens } from '../../util/helpers'
import { Context } from 'mocha'

const ONE = ethers.utils.parseEther('1')

export function stakeIncreaseTests () {
  let tx: Transaction
  let ctx: Context
  let totalShares: BigNumber
  let dyBefore: BigNumber
  let swapStakeBalBefore: BigNumber
  let farmBalanceBefore: BigNumber
  let ownerBalBefore: BigNumber

  beforeEach(async function () {
    ctx = this.test?.ctx!
    ownerBalBefore = await ctx.TenderToken.balanceOf(ctx.deployer)
    farmBalanceBefore = await ctx.TenderToken.balanceOf(ctx.TenderFarm.address)
    dyBefore = await ctx.TenderSwap.calculateSwap(ctx.TenderToken.address, ONE)
    swapStakeBalBefore = await ctx.Steak.balanceOf(ctx.TenderSwap.address)
    tx = await ctx.Tenderizer.claimRewards()
  })

  it('updates currentPrincipal', async () => {
    expect(await ctx.Tenderizer.currentPrincipal()).to.eq(ctx.newStake)
  })

  it('increases tendertoken balances when rewards are added', async () => {
    // account 0
    const shares = await ctx.TenderToken.sharesOf(ctx.deployer)
    totalShares = await ctx.TenderToken.getTotalShares()
    expect(await ctx.TenderToken.balanceOf(ctx.deployer)).to.eq(sharesToTokens(shares, totalShares, await ctx.TenderToken.totalSupply()))
  })

  it('increases the tenderToken balance of the AMM', async () => {
    const shares = await ctx.TenderToken.sharesOf(ctx.TenderSwap.address)
    expect(await ctx.TenderToken.balanceOf(ctx.TenderSwap.address)).to.eq(sharesToTokens(shares, totalShares, await ctx.TenderToken.totalSupply()))
  })

  it('steak balance stays the same', async () => {
    expect(await ctx.Steak.balanceOf(ctx.TenderSwap.address)).to.eq(swapStakeBalBefore)
  })

  it('tenderToken price slightly decreases vs underlying', async () => {
    expect(await ctx.TenderSwap.calculateSwap(ctx.TenderToken.address, ONE)).to.be.lt(dyBefore)
  })

  describe('collected protocol fees', () => {
    it('should increase tenderToken balance of owner', async () => {
      expect((await ctx.TenderToken.balanceOf(ctx.deployer)).sub(ownerBalBefore.add(ctx.protocolFees)).abs())
        .to.lte(1)
    })

    it('should emit ProtocolFeeCollected event from Tenderizer', async () => {
      await expect(tx).to.emit(ctx.Tenderizer, 'ProtocolFeeCollected').withArgs(ctx.protocolFees)
    })
  })

  describe('collected liquidity provider fees', () => {
    it('should increase tenderToken balance of tenderFarm', async () => {
      expect((await ctx.TenderToken.balanceOf(ctx.TenderFarm.address)).sub(farmBalanceBefore.add(ctx.liquidityFees)).abs())
        .to.lte(2)
    })

    it('should emit LiquidityFeeCollected event from Tenderizer', async () => {
      await expect(tx).to.emit(ctx.Tenderizer, 'LiquidityFeeCollected').withArgs(ctx.liquidityFees.sub(1))
    })
  })

  it('should emit RewardsClaimed event from Tenderizer', async () => {
    const oldPrinciple = ctx.initialStake
      .sub(ctx.initialStake.mul(ctx.DELEGATION_TAX).div(ctx.MAX_PPM))
    expect(tx).to.emit(ctx.Tenderizer, 'RewardsClaimed')
      .withArgs(ctx.increase, ctx.newStake, oldPrinciple)
  })
}

export function stakeStaysSameTests () {
  let ctx: Context
  let ownerBalBefore: BigNumber
  let farmBalBefore: BigNumber

  beforeEach(async function () {
    ctx = this.test?.ctx!
    ownerBalBefore = await ctx.TenderToken.balanceOf(ctx.deployer)
    farmBalBefore = await ctx.TenderToken.balanceOf(ctx.TenderFarm.address)

    await ctx.Tenderizer.claimRewards()
  })

  it('currentPrincipal stays the same', async () => {
    expect(await ctx.Tenderizer.currentPrincipal()).to.eq(ctx.expectedCP)
  })

  it('no fees are charged', async () => {
    expect(await ctx.TenderToken.balanceOf(ctx.deployer)).to.eq(ownerBalBefore)
    expect(await ctx.TenderToken.balanceOf(ctx.TenderFarm.address)).to.eq(farmBalBefore)
  })
}

export function stakeDecreaseTests () {
  let ctx: Context
  let ownerBalBefore: BigNumber
  let oldPrinciple: BigNumber
  let tx: ContractTransaction
  let totalShares: BigNumber
  let dyBefore: BigNumber
  let swapStakeBalBefore: BigNumber
  let farmBalBefore: BigNumber

  beforeEach(async function () {
    ctx = this.test?.ctx!
    ownerBalBefore = await ctx.TenderToken.balanceOf(ctx.deployer)
    oldPrinciple = await ctx.Tenderizer.currentPrincipal()
    dyBefore = await ctx.TenderSwap.calculateSwap(ctx.TenderToken.address, ONE)
    swapStakeBalBefore = await ctx.Steak.balanceOf(ctx.TenderSwap.address)
    farmBalBefore = await ctx.TenderToken.balanceOf(ctx.TenderFarm.address)
    tx = await ctx.Tenderizer.claimRewards()
  })

  it('updates currentPrincipal', async () => {
    expect(await ctx.Tenderizer.currentPrincipal()).to.eq(ctx.expectedCP)
  })

  it('decreases tendertoken balances when slashed', async () => {
    // account 0
    const shares = await ctx.TenderToken.sharesOf(ctx.deployer)
    totalShares = await ctx.TenderToken.getTotalShares()
    expect(await ctx.TenderToken.balanceOf(ctx.deployer))
      .to.eq(sharesToTokens(shares, totalShares, await ctx.TenderToken.totalSupply()))
  })

  it('no fees are charged', async () => {
    expect(await ctx.TenderToken.balanceOf(ctx.deployer)).to.eq(ownerBalBefore)
    expect(await ctx.TenderToken.balanceOf(ctx.TenderFarm.address)).to.eq(farmBalBefore)
  })

  it('decreases the tenderToken balance of the AMM', async () => {
    const shares = await ctx.TenderToken.sharesOf(ctx.TenderSwap.address)
    expect(await ctx.TenderToken.balanceOf(ctx.TenderSwap.address)).to.eq(sharesToTokens(shares, totalShares, await ctx.TenderToken.totalSupply()))
  })

  it('steak balance stays the same', async () => {
    expect(await ctx.Steak.balanceOf(ctx.TenderSwap.address)).to.eq(swapStakeBalBefore)
  })

  it('price of the TenderTokens increases vs the underlying', async () => {
    expect(await ctx.TenderSwap.calculateSwap(ctx.TenderToken.address, ONE)).to.be.gt(dyBefore)
  })

  it('should emit RewardsClaimed event from Tenderizer with 0 rewards and currentPrinciple', async () => {
    await expect(tx).to.emit(ctx.Tenderizer, 'RewardsClaimed').withArgs(ethers.constants.Zero.sub(ctx.decrease), ctx.expectedCP, oldPrinciple)
  })
}
