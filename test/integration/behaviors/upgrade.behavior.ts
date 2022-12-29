import { BigNumber, Contract, Transaction } from 'ethers/lib/ethers'
import { ethers } from 'hardhat'
import { expect } from 'chai'
import { EIP173Proxy } from '../../../typechain'
import { Context } from 'mocha'

export default function suite () {
  let ctx: Context
  let beforeBalance: BigNumber
  let tx: Transaction
  let proxy: EIP173Proxy
  let newTenderizer: Contract

  beforeEach(async function () {
    ctx = this.test?.ctx!
    proxy = (await ethers.getContractAt('EIP173Proxy', ctx.Tenderizer.address)) as EIP173Proxy
    beforeBalance = await ctx.Tenderizer.currentPrincipal()
    const newFac = await ethers.getContractFactory(ctx.NAME, ctx.signers[0])
    newTenderizer = await newFac.deploy()
    tx = await proxy.upgradeTo(newTenderizer.address)
  })

  it('upgrades tenderizer - emits event', async () => {
    expect(tx).to.emit(proxy, 'ProxyImplementationUpdated')
      .withArgs(ctx.TenderizerImpl.address, newTenderizer.address)
  })

  it('current principal still matches', async () => {
    const newPrincipal = await ctx.Tenderizer.currentPrincipal()
    expect(newPrincipal).to.equal(beforeBalance)
  })
}
