import { BigNumber, Transaction } from 'ethers/lib/ethers'
import { expect } from 'chai'

export default function suite () {
  let tx: Transaction
  let ctx: any
  before(async function () {
    ctx = this.test?.ctx
  })

  it('reverts because transfer amount exceeds allowance', async function () {
    await expect(ctx.Controller.deposit(ctx.deposit)).to.be.revertedWith('ERC20: transfer amount exceeds allowance')
  })

  describe('deposits funds succesfully', async () => {
    let supplyAfterTax: BigNumber
    before(async () => {
      await ctx.Steak.approve(ctx.Controller.address, ctx.deposit)
      supplyAfterTax = ctx.deposit.add(ctx.initialStake)
        .sub(ctx.deposit.add(ctx.initialStake).mul(ctx.DELEGATION_TAX).div(ctx.MAX_PPM))
      tx = await ctx.Controller.deposit(ctx.deposit)
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
