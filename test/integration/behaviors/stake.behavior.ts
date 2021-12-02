import { Transaction } from 'ethers/lib/ethers'
import { expect } from 'chai'
import hre, { ethers } from 'hardhat'
import { MockContract, smockit } from '@eth-optimism/smock'

export default function suite () {
  let tx: Transaction
  let ctx: any
  before(async function () {
    ctx = this.test?.ctx
  })

  it('bond succeeds', async () => {
    ctx.stakeMock.function.will.return()
    tx = await ctx.Controller.gulp()
    expect(ctx.stakeMock.function.calls.length).to.eq(1)
    // TODO: Antipattern - Refactor, possibly have assertion function defined
    // in main test file that are then called from here
    if (ctx.NAME === 'Matic') {
      const minSharesToMint = ctx.deposit.add(ctx.initialStake)
        .mul(ctx.exchangeRatePrecision).div(ctx.fxRate).sub(1)
      expect(ctx.stakeMock.function.calls[0]._minSharesToMint).to.eq(minSharesToMint)
    } else {
      expect(ctx.stakeMock.function.calls[0][ctx.stakeMock.nodeParam]).to.eq(ctx.NODE)
    }
    expect(ctx.stakeMock.function.calls[0][ctx.stakeMock.amountParam])
      .to.eq(ctx.deposit.add(ctx.initialStake))
  })

  it('emits Stake event from ctx.tenderizer', async () => {
    expect(tx).to.emit(ctx.Tenderizer, 'Stake').withArgs(ctx.NODE, ctx.deposit.add(ctx.initialStake))
  })

  it('uses specified node if passed, not default', async () => {
    let newNodeAddress: string
    // TODO: Antipattern - Refactor
    const newValidatorShare = await smockit(ctx.StakingContractNoMock)
    if (ctx.NAME === 'Matic') {
      newValidatorShare.smocked.buyVoucher.will.return()
      newNodeAddress = newValidatorShare.address
    } else {
      newNodeAddress = '0xd944a0F8C64D292a94C34e85d9038395e3762751' // dummy
    }
    const txData = ctx.Tenderizer.interface.encodeFunctionData('stake', [newNodeAddress, ethers.utils.parseEther('0')])
    await ctx.Controller.execute(ctx.Tenderizer.address, 0, txData)
    // TODO: Antipattern - Refactor
    if (ctx.NAME === 'Matic') {
      expect(newValidatorShare.smocked.buyVoucher.calls.length).to.eq(1)
    } else {
      expect(ctx.stakeMock.function.calls[0][ctx.stakeMock.nodeParam]).to.eq(newNodeAddress)
    }
  })

  it('uses specified amount if passed, not contract token balance', async () => {
    const amount = ethers.utils.parseEther('0.1')
    const txData = ctx.Tenderizer.interface.encodeFunctionData('stake', [ethers.constants.AddressZero, amount])
    await ctx.Controller.execute(ctx.Tenderizer.address, 0, txData)
    expect(ctx.stakeMock.function.calls[0][ctx.stakeMock.amountParam]).to.eq(amount)
  })

  it('returns without calling bond() if no balance', async () => {
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ctx.Tenderizer.address]
    }
    )
    const signer = await ethers.provider.getSigner(ctx.Tenderizer.address)
    await hre.network.provider.send('hardhat_setBalance', [
      ctx.Tenderizer.address,
          `0x${ethers.utils.parseEther('10')}`
    ])
    await ctx.Steak.connect(signer).transfer(ctx.NODE, ctx.deposit.add(ctx.initialStake))
    await hre.network.provider.request({
      method: 'hardhat_stopImpersonatingAccount',
      params: [ctx.Tenderizer.address]
    }
    )

    await ctx.Controller.gulp()
    expect(ctx.stakeMock.function.calls.length).to.eq(0)
  })
}
