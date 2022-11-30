import hre, { ethers } from 'hardhat'
import * as rpc from './util/snapshot'
import {
  SimpleToken, TenderToken, TenderFarm, TenderSwap, LiquidityPoolToken, GraphMock, Graph, EIP173Proxy
} from '../typechain'
import chai, { expect } from 'chai'
import {
  solidity
} from 'ethereum-waffle'
import { Deployment } from 'hardhat-deploy/dist/types'
import { BigNumber } from '@ethersproject/bignumber'

chai.use(solidity)

describe('Graph Integration Test', () => {
  let snapshotId: any
  let GraphMock: GraphMock

  let Graph: {[name: string]: Deployment}

  const protocolFeesPercent = ethers.utils.parseEther('50')
  const liquidityFeesPercent = ethers.utils.parseEther('50')

  beforeEach(async () => {
    snapshotId = await rpc.snapshot()
  })

  afterEach(async () => {
    await rpc.revert(snapshotId)
  })

  beforeEach('get signers', async function () {
    const namedAccs = await hre.getNamedAccounts()
    this.signers = await ethers.getSigners()

    this.deployer = namedAccs.deployer
  })

  beforeEach('deploy Graph token', async function () {
    const SimpleTokenFactory = await ethers.getContractFactory(
      'SimpleToken',
      this.signers[0]
    )

    this.Steak = (await SimpleTokenFactory.deploy('Graph Token', 'GRT', ethers.utils.parseEther('1000000'))) as SimpleToken
  })

  beforeEach('deploy Graph', async function () {
    const GraphFac = await ethers.getContractFactory(
      'GraphMock',
      this.signers[0]
    )

    GraphMock = (await GraphFac.deploy(this.Steak.address)) as GraphMock
    this.StakingContract = GraphMock
  })

  const STEAK_AMOUNT = '100000'

  beforeEach('deploy Graph Tenderizer', async function () {
    this.NODE = '0xf4e8Ef0763BCB2B1aF693F5970a00050a6aC7E1B'
    process.env.NAME = 'Graph'
    process.env.SYMBOL = 'GRT'
    process.env.CONTRACT = GraphMock.address
    process.env.TOKEN = this.Steak.address
    process.env.VALIDATOR = this.NODE
    process.env.STEAK_AMOUNT = STEAK_AMOUNT
    process.env.ADMIN_FEE = '0'
    process.env.SWAP_FEE = '5000000'
    process.env.AMPLIFIER = '85'

    this.methods = {
      stake: 'delegate',
      unstake: 'undelegate',
      withdrawStake: 'withdrawDelegated'
    }

    this.NAME = process.env.NAME
    this.SYMBOL = process.env.SYMBOL
    this.initialStake = ethers.utils.parseEther(STEAK_AMOUNT).div('2')
    this.deposit = ethers.utils.parseEther('100')

    this.unbondLockID = 0
    this.govUnboundLockID = 1
    // For porotocols where there is a tax to stake
    this.DELEGATION_TAX = BigNumber.from(5000)
    this.MAX_PPM = BigNumber.from(1000000)

    Graph = await hre.deployments.fixture(['Graph'], {
      keepExistingDeployments: false
    })
    this.Tenderizer = (await ethers.getContractAt('Graph', Graph.Graph.address)) as Graph
    this.TenderizerImpl = (await ethers.getContractAt('Graph', Graph.Graph_Implementation.address)) as Graph
    this.TenderToken = (await ethers.getContractAt('TenderToken', await this.Tenderizer.tenderToken())) as TenderToken
    this.TenderSwap = (await ethers.getContractAt('TenderSwap', await this.Tenderizer.tenderSwap())) as TenderSwap
    this.TenderFarm = (await ethers.getContractAt('TenderFarm', await this.Tenderizer.tenderFarm())) as TenderFarm
    this.LpToken = (await ethers.getContractAt('LiquidityPoolToken', await this.TenderSwap.lpToken())) as LiquidityPoolToken

    // Set contract variables
    await this.Tenderizer.setProtocolFee(protocolFeesPercent)
    await this.Tenderizer.setLiquidityFee(liquidityFeesPercent)
  })

  // Run tests
  describe('testUpgrade', async function () {
    it('upgrades', async function () {
        const newFac = await ethers.getContractFactory("Graph", this.signers[0])
        const newTenderizer = await newFac.deploy()
        const proxy = (await ethers.getContractAt('EIP173Proxy', this.Tenderizer.address)) as EIP173Proxy
        await proxy.upgradeTo(newTenderizer.address)
    })
  })

})

