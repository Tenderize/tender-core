import hre, { ethers } from 'hardhat'

import { IGraphToken, Graph, EIP173Proxy, IGraph } from '../../typechain'
import epochManagerAbi from './abis/graph/EpochManager.json'

import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { BigNumber } from '@ethersproject/bignumber'
import { Signer } from '@ethersproject/abstract-signer'

chai.use(solidity)
const { expect } = chai

describe('Graph Mainnet Fork Test - Redelegation', () => {
  let GraphToken: IGraphToken
  let Tenderizer: Graph
  let GraphStaking: IGraph
  let tenderizerOwner: Signer

  let signers: SignerWithAddress[]
  let deployer: string
  let cpBefore: BigNumber

  const DELEGATION_TAX = BigNumber.from(5000)
  const MAX_PPM = BigNumber.from(1000000)

  before('get signers', async () => {
    const namedAccs = await hre.getNamedAccounts()
    signers = await ethers.getSigners()
    deployer = namedAccs.deployer
  })

  const newNode = '0xb06071394531B63b0bac78f27e12dc2BEaA913E4'
  const stakingAddr = '0xF55041E37E12cD407ad00CE2910B8269B01263b9'
  const tenderizerAddr = '0xe66F3ab2f5621FE12ebf37754E1Af6d05b329A07'
  const grtTokenAddress = '0xc944e90c64b2c07662a292be6244bdf05cda44a7'
  const epochManagerAddr = '0x64F990Bf16552A693dCB043BB7bf3866c5E05DdB'
  const graphGovAddr = '0x48301fe520f72994d32ead72e2b6a8447873cf50'

  const testTimeout = 120000
  const depositAmount = ethers.utils.parseEther('100')

  before('deploy Graph Tenderizer', async function () {
    this.timeout(testTimeout)

    // Fork from mainnet
    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [
        {
          forking: {
            blockNumber: 16013315,
            jsonRpcUrl: process.env.ALCHEMY_MAINNET
          }
        }
      ]
    })

    // Set a shorter Epoch length so it's easier to test against
    const epochManager = new ethers.Contract(epochManagerAddr, epochManagerAbi, ethers.provider)
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [graphGovAddr]
    })
    const graphGov = await ethers.provider.getSigner(graphGovAddr)
    await epochManager.connect(graphGov).setEpochLength(1)

    Tenderizer = (await ethers.getContractAt('Graph', tenderizerAddr)) as Graph
    GraphStaking = (await ethers.getContractAt('IGraph', stakingAddr)) as IGraph

    // Mint some GRT
    await hre.network.provider.send('hardhat_setBalance', [
      graphGovAddr,
      `0x${ethers.utils.parseEther('100').toString()}`
    ])

    GraphToken = (await ethers.getContractAt('IGraphToken', grtTokenAddress)) as IGraphToken
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [graphGovAddr]
    })
    const GraphGovernor = await ethers.provider.getSigner(graphGovAddr)
    await GraphToken.connect(GraphGovernor).addMinter(deployer)
    await GraphToken.mint(deployer, ethers.utils.parseEther('100'))
  })

  describe('Perform Upgrade', async function () {
    before(async function () {
      cpBefore = await Tenderizer.currentPrincipal()
      const newFac = await ethers.getContractFactory('Graph', signers[0])
      const newTenderizer = await newFac.deploy()
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
    })

    it('current priciple stays the same', async function () {
      expect(await Tenderizer.currentPrincipal()).to.eq(cpBefore)
    })
  })

  describe('Migrate Stake', async function () {
    let oldNode: string
    let lockID: BigNumber
    let gov: Signer

    before(async () => {
      oldNode = await Tenderizer.node()
      await Tenderizer.claimRewards()
      cpBefore = await Tenderizer.currentPrincipal()
      const govAddress = await Tenderizer.gov()
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [govAddress]
      })
      gov = await ethers.provider.getSigner(govAddress)
      lockID = await Tenderizer.connect(gov).callStatic.migrateUnlock(newNode)
      await Tenderizer.connect(gov).migrateUnlock(newNode)
    })

    describe('migrate unlock', () => {
      it('updates PENDING_MIGRATION', async () => {
        // calculate current delegation
        const del = await GraphStaking.getDelegation(oldNode, Tenderizer.address)
        const pool = await GraphStaking.delegationPools(oldNode)
        const delegatedStake = del.shares.mul(pool.tokens).div(pool.shares)
        // TODO: Read from storage slot
        const pendingUnlocks = BigNumber.from('572568150870382308')
        const pendingMigration = BigNumber.from(await hre.ethers.provider.getStorageAt(Tenderizer.address, 18))
        expect(cpBefore).eq(await Tenderizer.currentPrincipal())
        expect(pendingMigration.add(pendingUnlocks)).eq(delegatedStake)
      })

      it('reverts if pending migration ongoing', async () => {
        await expect(Tenderizer.connect(gov).migrateUnlock(newNode)).to.be.revertedWith('PENDING_MIGRATION')
      })
    })

    describe('Process Unlock', async function () {
      before(async function () {
        await Tenderizer.connect(gov).processUnstake()
      })

      it('unstakes from underlying', async function () {
        const del = await GraphStaking.getDelegation(oldNode, Tenderizer.address)
        expect(del.shares).to.eq(0)
      })

      it('current priciple stays the same', async function () {
        expect((await Tenderizer.currentPrincipal())).to.eq(cpBefore)
      })

      it('sets new node succesfully', async function () {
        expect(await Tenderizer.node()).to.eq(newNode)
      })
    })

    describe('New deposit and claim rewards', async function () {
      before(async function () {
        // TODO: Change this to be a random user and check its tToken balance stays the same after migration
        await GraphToken.connect(signers[0]).approve(Tenderizer.address, depositAmount)
        await Tenderizer.deposit(depositAmount)
        await Tenderizer.claimRewards()
      })

      it('updates CP: deducts tax from migration funds + new deposit)', async function () {
        let exp = cpBefore.add(depositAmount)
        exp = exp.sub(exp.mul(DELEGATION_TAX).div(MAX_PPM))
        expect((await Tenderizer.currentPrincipal()).sub(exp).abs()).to.lte(1)
      })

      it('delegates stake in new node', async function () {
        const del = await GraphStaking.getDelegation(newNode, Tenderizer.address)
        const pool = await GraphStaking.delegationPools(newNode)
        const stakeInNewNode = del.shares.mul(pool.tokens).div(pool.shares)
        const exp = depositAmount.sub(depositAmount.mul(DELEGATION_TAX).div(MAX_PPM))
        expect(exp.sub(stakeInNewNode).abs()).to.lte(1)
      })
    })

    describe('Migrate Withdraw', async function () {
      before(async function () {
        cpBefore = await Tenderizer.currentPrincipal()
        // Progress blocks
        for (let j = 0; j < 100; j++) {
          await hre.ethers.provider.send('evm_mine', [])
        }
        await Tenderizer.connect(gov).processWithdraw(oldNode)
        await Tenderizer.connect(gov).migrateWithdraw(lockID)
      })

      it('cp stays the same', async function () {
        expect((await Tenderizer.currentPrincipal()).sub(cpBefore).abs()).to.lte(2)
      })

      it('stake moves to new node', async function () {
        const del = await GraphStaking.getDelegation(newNode, Tenderizer.address)
        const pool = await GraphStaking.delegationPools(newNode)
        const stakeInNewNode = del.shares.mul(pool.tokens).div(pool.shares)
        expect(stakeInNewNode.sub(cpBefore).abs()).to.lte(2)
      })
    })
  })
})
