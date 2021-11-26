import { BigNumber, Contract, Transaction } from 'ethers/lib/ethers'
import hre, { ethers } from 'hardhat'
import { expect } from 'chai'
import { EIP173Proxy } from '../../../typechain'

export default function suite () {
  let ctx: any
  let beforeBalance: BigNumber
  let tx: Transaction
  let proxy: EIP173Proxy
  let newTenderizer: Contract

  before(async function () {
    ctx = this.test?.ctx
    proxy = (await ethers.getContractAt('EIP173Proxy', ctx.Tenderizer.address)) as EIP173Proxy
    beforeBalance = await ctx.Tenderizer.currentPrincipal()
    const newFac = await ethers.getContractFactory(ctx.NAME, ctx.signers[0])
    newTenderizer = await newFac.deploy()
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ctx.Controller.address]
    }
    )

    const signer = await ethers.provider.getSigner(ctx.Controller.address)

    await hre.network.provider.send('hardhat_setBalance', [
      ctx.Controller.address,
        `0x${ethers.utils.parseEther('10')}`
    ])

    tx = await proxy.connect(signer).upgradeTo(newTenderizer.address)

    await hre.network.provider.request({
      method: 'hardhat_stopImpersonatingAccount',
      params: [ctx.Controller.address]
    })
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
