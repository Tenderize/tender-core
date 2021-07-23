import hre, { ethers } from 'hardhat'

import { MockContract, smockit } from '@eth-optimism/smock'

import {
  SimpleToken, Controller, Tenderizer, ElasticSupplyPool, TenderToken, IGraph, BPool, EIP173Proxy
} from '../../typechain/'

import { sharesToTokens } from '../util/helpers'

import chai from 'chai'
import {
  solidity
} from 'ethereum-waffle'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { Deployment } from 'hardhat-deploy/dist/types'
import { BigNumber } from '@ethersproject/bignumber'
import { ContractTransaction } from '@ethersproject/contracts'

chai.use(solidity)
const {
  expect
} = chai

describe('Graph Integration Test', () => {
  let GraphNoMock: IGraph
  let GraphMock: MockContract
  let GraphToken: SimpleToken
  let Controller: Controller
  let Tenderizer: Tenderizer
  let TenderToken: TenderToken
  let Esp: ElasticSupplyPool
  let BPool: BPool

  let Graph: {[name: string]: Deployment}

  let signers: SignerWithAddress[]
  let deployer: string

  before('get signers', async () => {
    const namedAccs = await hre.getNamedAccounts()
    signers = await ethers.getSigners()

    deployer = namedAccs.deployer
  })

  before('deploy Graph token', async () => {
    const SimpleTokenFactory = await ethers.getContractFactory(
      'SimpleToken',
      signers[0]
    )

    GraphToken = (await SimpleTokenFactory.deploy('Graph Token', 'GRT', ethers.utils.parseEther('1000000'))) as SimpleToken
  })

  before('deploy Graph', async () => {
    const GraphFac = await ethers.getContractFactory(
      'GraphMock',
      signers[0]
    )

    GraphNoMock = (await GraphFac.deploy(GraphToken.address)) as IGraph

    GraphMock = await smockit(GraphNoMock)
  })

  const STEAK_AMOUNT = '100000'
  const NODE = '0xf4e8Ef0763BCB2B1aF693F5970a00050a6aC7E1B'

  before('deploy Graph Tenderizer', async () => {
    process.env.NAME = 'Graph'
    process.env.SYMBOL = 'GRT'
    process.env.CONTRACT = GraphMock.address
    process.env.TOKEN = GraphToken.address
    process.env.NODE = NODE
    process.env.STEAK_AMOUNT = STEAK_AMOUNT
    Graph = await hre.deployments.fixture(['Graph'])
    Controller = (await ethers.getContractAt('Controller', Graph.Controller.address)) as Controller
    Tenderizer = (await ethers.getContractAt('Tenderizer', Graph.Graph.address)) as Tenderizer
    TenderToken = (await ethers.getContractAt('TenderToken', Graph.TenderToken.address)) as TenderToken
    Esp = (await ethers.getContractAt('ElasticSupplyPool', Graph.ElasticSupplyPool.address)) as ElasticSupplyPool
    BPool = (await ethers.getContractAt('BPool', await Esp.bPool())) as BPool
    await Controller.execute(
      Tenderizer.address,
      0,
      Tenderizer.interface.encodeFunctionData('setProtocolFee', [0])
    )
    await Controller.execute(
      Tenderizer.address,
      0,
      Tenderizer.interface.encodeFunctionData('setLiquidityFee', [0])
    )
  })

  const initialStake = ethers.utils.parseEther(STEAK_AMOUNT).div('2')

  const deposit = ethers.utils.parseEther('100')

  describe('deposit', () => {
    describe('deposits funds succesfully', async () => {
      let tx: ContractTransaction
      before(async () => {
        await GraphToken.approve(Controller.address, deposit)
        tx = await Controller.deposit(deposit)
      })

      it('increases TenderToken supply', async () => {
        expect(await TenderToken.totalSupply()).to.eq(deposit.add(initialStake))
      })

      it('increases Tenderizer principle', async () => {
        expect(await Tenderizer.currentPrincipal()).to.eq(deposit.add(initialStake))
      })

      it('increases TenderToken balance of depositor', async () => {
        expect(await TenderToken.balanceOf(deployer)).to.eq(deposit)
      })

      it('emits Deposit event from tenderizer', async () => {
        expect(tx).to.emit(Tenderizer, 'Deposit').withArgs(deployer, deposit)
      })
    })
  })

  describe('stake', () => {
    describe('stakes succeessfully', async () => {
      let tx: ContractTransaction
      it('bond succeeds', async () => {
        GraphMock.smocked.delegate.will.return()
        tx = await Controller.gulp()
        expect(GraphMock.smocked.delegate.calls.length).to.eq(1)
        expect(GraphMock.smocked.delegate.calls[0]._indexer).to.eq(NODE)
        // A smocked contract doesn't execute its true code
        // So livepeer.bond() never calls ERC20.transferFrom() under the hood
        // Therefore when we call gulp() it will be for the deposit and bootstrapped supply on deployment
        // Smock doesn't support executing code
        expect(GraphMock.smocked.delegate.calls[0]._tokens).to.eq(deposit.add(initialStake))
      })

      it('emits Stake event from tenderizer', async () => {
        expect(tx).to.emit(Tenderizer, 'Stake').withArgs(NODE, deposit.add(initialStake))
      })
    })
  })

  describe('rebase', () => {
    describe('stake increased', () => {
      const increase = ethers.BigNumber.from('10000000000')
      const newStake = deposit.add(initialStake).add(increase)
      const percDiv = ethers.utils.parseEther('1')
      let totalShares: BigNumber = ethers.utils.parseEther('1')
      let tx: ContractTransaction

      before(async () => {
        totalShares = await TenderToken.getTotalShares()
        GraphMock.smocked.getDelegation.will.return.with(
          {
            shares: 100,
            tokensLocked: 0,
            tokensLockedUntil: 0
          }
        )
        GraphMock.smocked.delegationPools.will.return.with({
          tokens: newStake,
          shares: 100,
          cooldownBlocks: 0,
          indexingRewardCut: 0,
          queryFeeCut: 0,
          updatedAtBlock: 0
        })
        tx = await Controller.rebase()
      })

      it('updates currentPrincipal', async () => {
        expect(await Tenderizer.currentPrincipal()).to.eq(newStake)
      })

      it('increases tendertoken balances when rewards are added', async () => {
        // account 0
        const shares = await TenderToken.sharesOf(deployer)
        expect(await TenderToken.balanceOf(deployer)).to.eq(sharesToTokens(shares, totalShares, await TenderToken.totalSupply()))
      })

      it('increases the tenderToken balance of the AMM', async () => {
        const shares = await TenderToken.sharesOf(BPool.address)
        expect(await TenderToken.balanceOf(BPool.address)).to.eq(sharesToTokens(shares, totalShares, await TenderToken.totalSupply()))
      })

      it('changes the weights of the AMM', async () => {
        const tBal = await TenderToken.balanceOf(BPool.address)
        const bal = await GraphToken.balanceOf(BPool.address)

        const acceptableDelta = ethers.BigNumber.from('100')

        const expected = tBal.mul(percDiv).div(tBal.add(bal))
        const actual = await BPool.getNormalizedWeight(TenderToken.address)
        expect(actual.sub(expected).abs()).to.be.lte(acceptableDelta)
      })

      it('should emit RewardsClaimed event from Tenderizer', async () => {
        expect(tx).to.emit(Tenderizer, 'RewardsClaimed').withArgs(increase, newStake)
      })
    })

    describe('stake decrease', () => {
      // The decrease will offset the increase from the previous test
      const newStake = deposit.add(initialStake)
      const percDiv = ethers.utils.parseEther('1')

      let feesBefore: BigNumber = ethers.constants.Zero
      let tx: ContractTransaction

      before(async () => {
        feesBefore = await Tenderizer.pendingFees()
        GraphMock.smocked.getDelegation.will.return.with(
          {
            shares: 100,
            tokensLocked: 0,
            tokensLockedUntil: 0
          }
        )
        GraphMock.smocked.delegationPools.will.return.with({
          tokens: newStake,
          shares: 100,
          cooldownBlocks: 0,
          indexingRewardCut: 0,
          queryFeeCut: 0,
          updatedAtBlock: 0
        })
        tx = await Controller.rebase()
      })

      it('updates currentPrincipal', async () => {
        expect(await Tenderizer.currentPrincipal()).to.eq(newStake)
      })

      it('decreases tendertoken balances when rewards are added', async () => {
        // account 0
        expect(await TenderToken.balanceOf(deployer)).to.eq(deposit)
      })

      it("doesn't increase pending fees", async () => {
        expect(await Tenderizer.pendingFees()).to.eq(feesBefore)
      })

      it('decreases the tenderToken balance of the AMM', async () => {
        expect(await TenderToken.balanceOf(BPool.address)).to.eq(initialStake)
      })

      it('changes the weights of the AMM', async () => {
        const acceptableDelta = ethers.BigNumber.from('100')

        const expected = percDiv.div(2)
        const actual = await BPool.getNormalizedWeight(TenderToken.address)
        expect(actual.sub(expected).abs()).to.be.lte(acceptableDelta)
      })

      it('should emit RewardsClaimed event from Tenderizer with 0 rewards and currentPrinciple', async () => {
        expect(tx).to.emit(Tenderizer, 'RewardsClaimed').withArgs('0', newStake)
      })
    })
  })

  describe('collect fees', () => {
    let fees: BigNumber
    let ownerBalBefore: BigNumber
    let tx: ContractTransaction

    before(async () => {
      fees = await Tenderizer.pendingFees()
      ownerBalBefore = await TenderToken.balanceOf(deployer)
      tx = await Controller.collectFees()
    })

    it('should reset pendingFees', async () => {
      expect(await Tenderizer.pendingFees()).to.eq(ethers.constants.Zero)
    })

    it('should increase tenderToken balance of owner', async () => {
      expect(await TenderToken.balanceOf(deployer)).to.eq(ownerBalBefore.add(fees))
    })

    it('should emit ProtocolFeeCollected event from Tenderizer', async () => {
      expect(tx).to.emit(Tenderizer, 'ProtocolFeeCollected').withArgs(fees)
    })
  })

  describe('swap against ESP', () => {
    it('swaps tenderToken for Token', async () => {
      const amount = deposit.div(2)
      const lptBalBefore = await GraphToken.balanceOf(deployer)

      const tenderBal = await BPool.getBalance(TenderToken.address)
      const lptBal = await BPool.getBalance(GraphToken.address)
      const tenderWeight = await BPool.getDenormalizedWeight(TenderToken.address)
      const lptWeight = await BPool.getDenormalizedWeight(GraphToken.address)
      const swapFee = await BPool.getSwapFee()
      const expOut = await BPool.calcOutGivenIn(
        tenderBal,
        tenderWeight,
        lptBal,
        lptWeight,
        amount,
        swapFee
      )

      await TenderToken.approve(BPool.address, amount)
      await BPool.swapExactAmountIn(
        TenderToken.address,
        amount,
        GraphToken.address,
        ethers.constants.One, // TODO: set proper value
        ethers.utils.parseEther('10') // TODO: set proper value
      )

      const lptBalAfter = await GraphToken.balanceOf(deployer)
      expect(lptBalAfter.sub(lptBalBefore)).to.eq(expOut)
    })
  })

  describe('unlock', () => {

  })

  describe('withdraw', () => {

  })

  describe('upgrade', () => {
    let proxy: EIP173Proxy
    let newTenderizer:any
    let beforeBalance: BigNumber
    before(async () => {
      proxy = (await ethers.getContractAt('EIP173Proxy', Graph.Graph_Proxy.address)) as EIP173Proxy
      beforeBalance = await Tenderizer.currentPrincipal()
      const newFac = await ethers.getContractFactory('Graph', signers[0])
      newTenderizer = await newFac.deploy()
    })

    it('upgrade tenderizer', async () => {
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [Controller.address]
      }
      )

      const signer = await ethers.provider.getSigner(Controller.address)

      expect(await proxy.connect(signer).upgradeTo(newTenderizer.address, { gasLimit: 400000, gasPrice: 0 })).to.emit(
        proxy,
        'ProxyImplementationUpdated'
      ).withArgs(Graph.Graph_Implementation.address, newTenderizer.address)

      await hre.network.provider.request({
        method: 'hardhat_stopImpersonatingAccount',
        params: [Controller.address]
      }
      )
    })

    it('current principal still matches', async () => {
      const newPrincipal = await Tenderizer.currentPrincipal()
      expect(newPrincipal).to.equal(beforeBalance)
    })
  })
})
