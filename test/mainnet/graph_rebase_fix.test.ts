import hre, { ethers } from 'hardhat'

import { ERC20, Graph, EIP173Proxy, IGraph } from '../../typechain'

import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { BigNumber } from '@ethersproject/bignumber'
import { Signer } from '@ethersproject/abstract-signer'

chai.use(solidity)
const { expect } = chai

describe('Graph Mainnet Fork Test - Rebase Fix', () => {
  let GraphToken: ERC20
  let GraphStaking: IGraph
  let Tenderizer: Graph
  let tenderizerOwner: Signer

  let signers: SignerWithAddress[]
  let deployer: string
  let cpBefore: BigNumber

  before('get signers', async () => {
    const namedAccs = await hre.getNamedAccounts()
    signers = await ethers.getSigners()
    deployer = namedAccs.deployer
  })

  const tenderizerAddr = '0xe66F3ab2f5621FE12ebf37754E1Af6d05b329A07'
  const grtTokenAddress = '0xc944e90c64b2c07662a292be6244bdf05cda44a7'
  const stakingAddr = '0xF55041E37E12cD407ad00CE2910B8269B01263b9'

  const GRTHolder = '0xa64bc086d8bfaff4e05e277f971706d67559b1d1'
  let GRTHolderSinger: Signer

  const DELEGATION_TAX = BigNumber.from(5000)
  const MAX_PPM = BigNumber.from(1000000)

  const testTimeout = 120000

  before(async function () {
    this.timeout(testTimeout)

    // Fork from mainnet
    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [
        {
          forking: {
            block: 16448263,
            jsonRpcUrl: process.env.ALCHEMY_MAINNET
          }
        }
      ]
    })

    Tenderizer = (await ethers.getContractAt('Graph', tenderizerAddr)) as Graph
    GraphStaking = (await ethers.getContractAt('IGraph', stakingAddr)) as IGraph

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [GRTHolder]
    })
    GRTHolderSinger = await ethers.provider.getSigner(GRTHolder)

    // Transfer some ETH
    await hre.network.provider.send('hardhat_setBalance', [
      GRTHolder,
      `0x${ethers.utils.parseEther('100').toString()}`
    ])

    // Transfer some GRT
    GraphToken = (await ethers.getContractAt('ERC20', grtTokenAddress)) as ERC20
    await GraphToken.connect(GRTHolderSinger).transfer(deployer, ethers.utils.parseEther('100'))

    await hre.network.provider.request({
      method: 'hardhat_stopImpersonatingAccount',
      params: [GRTHolder]
    })
  })

  describe('Pre-Upgrade', async function () {
    it('claimRewards reverts before upgrade', async () => {
      await expect(Tenderizer.claimRewards()).to.be.reverted
    })

    it('successfully performs upgrade', async function () {
      cpBefore = await Tenderizer.currentPrincipal()
      const newTenderizer = await (await ethers.getContractFactory('Graph', signers[0])).deploy()
      const proxy = (await ethers.getContractAt('EIP173Proxy', Tenderizer.address)) as EIP173Proxy
      await hre.network.provider.send('hardhat_setBalance', [
        await proxy.owner(),
        `0x${ethers.utils.parseEther('100').toString()}`
      ])

      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [await proxy.owner()]
      })
      tenderizerOwner = await ethers.provider.getSigner(await proxy.owner())
      await proxy.connect(tenderizerOwner).upgradeTo(newTenderizer.address)
      expect(await Tenderizer.currentPrincipal(), 'CP does not match').to.eq(cpBefore)
    })
  })

  describe('Post upgrade', async function () {
    it('claim rewards succeeds', async () => {
      const bal = await GraphToken.balanceOf(Tenderizer.address)
      let eventFilter = Tenderizer.filters.Unstake(Tenderizer.address, null, null, null)
      const events = await Tenderizer.queryFilter(eventFilter, 16370000, 16448263)
      const pendingMigration = events[0].args.amount

      eventFilter = Tenderizer.filters.Unstake(null, null, null, null)
      let pendingUnlocks = BigNumber.from(0)
      const unlockEventsAfter = await Tenderizer.queryFilter(eventFilter, 16371300, 'latest')
      unlockEventsAfter.forEach(e => { pendingUnlocks = pendingUnlocks.add(e.args.amount) })
      const expCP =
        (bal.add(pendingMigration)).mul(MAX_PPM.sub(DELEGATION_TAX)).div(MAX_PPM)
          .sub(pendingUnlocks)

      await Tenderizer.claimRewards()

      expect(await GraphToken.balanceOf(Tenderizer.address), 'Tenderizer Balance not staked').to.eq(0)
      expect((await Tenderizer.currentPrincipal()).sub(expCP).abs(), 'CP incorrect').to.lte(5)

      const newNode = await Tenderizer.node()
      const del = await GraphStaking.getDelegation(newNode, Tenderizer.address)
      const pool = await GraphStaking.delegationPools(newNode)
      const newNodeStake = pool.tokens.mul(del.shares).div(pool.shares)
      expect(bal.mul(MAX_PPM.sub(DELEGATION_TAX)).div(MAX_PPM), 'not staked to new node').to.eq(newNodeStake)
    })
  })
})
