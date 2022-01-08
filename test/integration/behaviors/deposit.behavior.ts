import { BigNumber, Transaction } from 'ethers/lib/ethers'
import { expect } from 'chai'
import { signERC2612Permit } from 'eth-permit'
import { Context } from 'mocha'

export default function suite () {
  let tx: Transaction
  let ctx: Context
  before(async function () {
    ctx = this.test?.ctx!
  })

  it('reverts because transfer amount exceeds allowance', async function () {
    await expect(ctx.Tenderizer.deposit(ctx.deposit)).to.be.revertedWith('ERC20: transfer amount exceeds allowance')
  })

  describe('deposits funds with permit', async () => {
    let supplyAfterTax: BigNumber
    before(async () => {
      supplyAfterTax = ctx.deposit.add(ctx.initialStake)
        .sub(ctx.deposit.add(ctx.initialStake).mul(ctx.DELEGATION_TAX).div(ctx.MAX_PPM))

      const signed = await signERC2612Permit(ctx.signers[0], ctx.Steak.address, ctx.signers[0].address, ctx.Tenderizer.address, ctx.deposit.toString())

      tx = await ctx.Tenderizer.depositWithPermit(ctx.deposit, signed.deadline, signed.v, signed.r, signed.s)
    })

    it('increases TenderToken supply', async () => {
      expect(await ctx.TenderToken.totalSupply()).to.eq(supplyAfterTax)
    })

    it('increases Tenderizer principle', async () => {
      expect(await ctx.Tenderizer.currentPrincipal()).to.eq(supplyAfterTax)
    })

    it('increases TenderToken balance of depositor', async () => {
      expect(await ctx.TenderToken.balanceOf(ctx.deployer)).to.eq(ctx.deposit
        .sub(ctx.deposit.mul(ctx.DELEGATION_TAX).div(ctx.MAX_PPM)))
    })

    it('emits Deposit event from tenderizer', async () => {
      expect(tx).to.emit(ctx.Tenderizer, 'Deposit').withArgs(ctx.deployer, ctx.deposit)
    })
  })
}
