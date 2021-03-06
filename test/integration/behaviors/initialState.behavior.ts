import { BigNumber } from 'ethers/lib/ethers'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { Context } from 'mocha'
import { PERC_DIVISOR } from '../../util/constants'

export default function suite () {
  let ctx: Context

  const expFees = ethers.utils.parseEther('50')
  const expSwapFee = BigNumber.from(5).mul(BigNumber.from(10).pow(6))
  const expAdminFee = ethers.constants.Zero
  const expIntialA = BigNumber.from(8500)

  before(async function () {
    ctx = this.test?.ctx!
  })

  describe('Tenderizer', async function () {
    it('Gov is deployer', async function () {
      expect(await ctx.Tenderizer.gov()).to.eq(ctx.deployer)
    })

    it('protocol fee is set', async function () {
      expect(await ctx.Tenderizer.protocolFee()).to.eq(expFees)
    })

    it('reverts when trying to set protocol fee higher than MAX_FEE', async function () {
      await expect(ctx.Tenderizer.setProtocolFee(PERC_DIVISOR)).to.be.revertedWith('FEE_EXCEEDS_MAX')
    })

    it('liquidity fee is set', async function () {
      expect(await ctx.Tenderizer.liquidityFee()).to.eq(expFees)
    })

    it('reverts when trying to set liquidity fee higher than MAX_FEE', async function () {
      await expect(ctx.Tenderizer.setLiquidityFee(PERC_DIVISOR)).to.be.revertedWith('FEE_EXCEEDS_MAX')
    })

    it('TenderSwap is deployed and set', async function () {
      expect(await ctx.Tenderizer.tenderSwap()).to.eq(ctx.TenderSwap.address)
    })

    it('TenderToken is deployed and set', async function () {
      expect(await ctx.Tenderizer.tenderToken()).to.eq(ctx.TenderToken.address)
    })

    it('TenderFarm is deployed and set', async function () {
      expect(await ctx.Tenderizer.tenderFarm()).to.eq(ctx.TenderFarm.address)
    })
  })

  describe('TenderSwap', async function () {
    it('Owner is Deployer', async function () {
      expect(await ctx.TenderSwap.owner()).to.eq(ctx.deployer)
    })

    it('TenderToken is set', async function () {
      expect(await ctx.TenderSwap.getToken0()).to.eq(ctx.TenderToken.address)
    })

    it('Steak is set', async function () {
      expect(await ctx.TenderSwap.getToken1()).to.eq(ctx.Steak.address)
    })

    it('Fees are set', async function () {
      const feeParams = await ctx.TenderSwap.feeParams()
      expect(feeParams.swapFee).to.eq(expSwapFee)
      expect(feeParams.adminFee).to.eq(expAdminFee)
    })

    it('Amplification param is set', async function () {
      const aParams = await ctx.TenderSwap.amplificationParams()
      expect(aParams.initialA).to.eq(expIntialA)
    })
  })

  describe('TenderToken', async function () {
    it('Owner is Tenderizer', async function () {
      expect(await ctx.TenderToken.owner()).to.eq(ctx.Tenderizer.address)
    })

    it('Total staked reader (Tenderizer) is set', async function () {
      expect(await ctx.TenderToken.totalStakedReader()).to.eq(ctx.Tenderizer.address)
    })

    it('Name is set', async function () {
      expect(await ctx.TenderToken.name()).to.eq('tender ' + ctx.SYMBOL)
    })

    it('Sybmol is set', async function () {
      expect(await ctx.TenderToken.symbol()).to.eq('t' + ctx.SYMBOL)
    })
  })
}
