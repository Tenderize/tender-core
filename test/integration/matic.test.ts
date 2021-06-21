import hre, { ethers } from 'hardhat'

import { MockContract, smockit } from '@eth-optimism/smock'

import {
  SimpleToken, Controller, Tenderizer, ElasticSupplyPool, TenderToken, IMatic, BPool, EIP173Proxy
} from '../../typechain/'

import chai from 'chai'
import {
  solidity
} from 'ethereum-waffle'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { Deployment } from 'hardhat-deploy/dist/types'
import { BigNumber } from '@ethersproject/bignumber'

import { sharesToTokens } from '../util/helpers'

chai.use(solidity)
const {
  expect
} = chai

describe('Matic Integration Test', () => {
  let MaticNoMock: IMatic
  let MaticMock: MockContract
  let MaticToken: SimpleToken
  let Controller: Controller
  let Tenderizer: Tenderizer
  let TenderToken: TenderToken
  let Esp: ElasticSupplyPool
  let BPool: BPool

  let Matic: {[name: string]: Deployment}

  let signers: SignerWithAddress[]
  let deployer: string

  before('get signers', async () => {
    const namedAccs = await hre.getNamedAccounts()
    signers = await ethers.getSigners()

    deployer = namedAccs.deployer
  })

  before('deploy Matic token', async () => {
    const SimpleTokenFactory = await ethers.getContractFactory(
      'SimpleToken',
      signers[0]
    )

    MaticToken = (await SimpleTokenFactory.deploy('Matic Token', 'MATIC', ethers.utils.parseEther('1000000'))) as SimpleToken
  })

  before('deploy Matic', async () => {
    const MaticFac = await ethers.getContractFactory(
      'MaticMock',
      signers[0]
    )

    MaticNoMock = (await MaticFac.deploy(MaticToken.address)) as IMatic

    MaticMock = await smockit(MaticNoMock)
  })

  const STEAK_AMOUNT = '100000'

  before('deploy Matic Tenderizer', async () => {
    process.env.NAME = 'Matic'
    process.env.SYMBOL = 'MATIC'
    process.env.NODE = MaticMock.address
    process.env.TOKEN = MaticToken.address
    process.env.CONTRACT = '0x0000000000000000000000000000000000000101' // dummy
    process.env.STEAK_AMOUNT = STEAK_AMOUNT
    Matic = await hre.deployments.fixture(['Matic'])
    Controller = (await ethers.getContractAt('Controller', Matic.Controller.address)) as Controller
    Tenderizer = (await ethers.getContractAt('Tenderizer', Matic.Matic.address)) as Tenderizer
    TenderToken = (await ethers.getContractAt('TenderToken', Matic.TenderToken.address)) as TenderToken
    Esp = (await ethers.getContractAt('ElasticSupplyPool', Matic.ElasticSupplyPool.address)) as ElasticSupplyPool
    BPool = (await ethers.getContractAt('BPool', await Esp.bPool())) as BPool
    await Controller.execute(
      Tenderizer.address,
      0,
      Tenderizer.interface.encodeFunctionData('setProtocolFee', [0])
    )
  })

  const initialStake = ethers.utils.parseEther(STEAK_AMOUNT).div('2')

  const deposit = ethers.utils.parseEther('100')

  describe('deposit', () => {
    it('reverts because transfer amount exceeds allowance', async () => {
      await expect(Controller.connect(signers[0]).deposit(deposit)).to.be.revertedWith('ERC20: transfer amount exceeds allowance')
    })
    it('deposits funds', async () => {
      await MaticToken.connect(signers[0]).approve(Controller.address, deposit)
      await Controller.connect(signers[0]).deposit(deposit)
      expect(await TenderToken.totalSupply()).to.eq(deposit.add(initialStake))
      expect(await Tenderizer.currentPrincipal()).to.eq(deposit.add(initialStake))
      expect(await TenderToken.balanceOf(deployer)).to.eq(deposit)
    })
  })

  describe('stake', () => {
    it('bond reverts', async () => {
      MaticMock.smocked.buyVoucher.will.revert()
      await expect(Controller.gulp()).to.be.reverted
    })

    it('bond succeeds', async () => {
      MaticMock.smocked.buyVoucher.will.return()
      await Controller.gulp()
      expect(MaticMock.smocked.buyVoucher.calls.length).to.eq(1)
      // A smocked contract doesn't execute its true code
      // So matic.buyVoucher() never calls ERC20.transferFrom() under the hood
      // Therefore when we call gulp() it will be for the deposit and bootstrapped supply on deployment
      // Smock doesn't support executing code
      expect(MaticMock.smocked.buyVoucher.calls[0]._amount).to.eq(deposit.add(initialStake))
    })
  })

  describe('rebase', () => {
    describe('stake increased', () => {
      const increase = ethers.BigNumber.from('10000000000')
      const newStake = deposit.add(initialStake).add(increase)
      const percDiv = ethers.utils.parseEther('1')
      let totalShares: BigNumber = ethers.utils.parseEther('1')

      before(async () => {
        totalShares = await TenderToken.getTotalShares()
        MaticMock.smocked.balanceOf.will.return.with(newStake)
        MaticMock.smocked.exchangeRate.will.return.with(100)
        await Controller.rebase()
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
        const bal = await MaticToken.balanceOf(BPool.address)

        const acceptableDelta = ethers.BigNumber.from('100')

        const expected = tBal.mul(percDiv).div(tBal.add(bal))
        const actual = await BPool.getNormalizedWeight(TenderToken.address)
        expect(actual.sub(expected).abs()).to.be.lte(acceptableDelta)
      })
    })

    describe('stake decrease', () => {
      // The decrease will offset the increase from the previous test
      const newStake = deposit.add(initialStake)
      const percDiv = ethers.utils.parseEther('1')

      let feesBefore: BigNumber = ethers.constants.Zero

      before(async () => {
        feesBefore = await Tenderizer.pendingFees()
        MaticMock.smocked.balanceOf.will.return.with(newStake)
        MaticMock.smocked.exchangeRate.will.return.with(100)
        await Controller.rebase()
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
        const acceptableDelta = ethers.BigNumber.from('10')

        const expected = percDiv.div(2)
        const actual = await BPool.getNormalizedWeight(TenderToken.address)
        expect(actual.sub(expected).abs()).to.be.lte(acceptableDelta)
      })
    })
  })

  describe('collect fees', () => {
    let fees: BigNumber
    let ownerBalBefore: BigNumber
    before(async () => {
      fees = await Tenderizer.pendingFees()
      ownerBalBefore = await TenderToken.balanceOf(deployer)
      await Controller.collectFees()
    })

    it('should reset pendingFees', async () => {
      expect(await Tenderizer.pendingFees()).to.eq(ethers.constants.Zero)
    })

    it('should increase tenderToken balance of owner', async () => {
      const newBalance = await TenderToken.balanceOf(deployer)
      const acceptableDelta = ethers.BigNumber.from('10')

      expect(newBalance.sub(ownerBalBefore.add(fees)).abs()).to.be.lte(acceptableDelta)
    })
  })

  describe('swap against ESP', () => {
    it('swaps tenderToken for Token', async () => {
      const amount = deposit.div(2)
      const lptBalBefore = await MaticToken.balanceOf(deployer)

      const tenderBal = await BPool.getBalance(TenderToken.address)
      const lptBal = await BPool.getBalance(MaticToken.address)
      const tenderWeight = await BPool.getDenormalizedWeight(TenderToken.address)
      const lptWeight = await BPool.getDenormalizedWeight(MaticToken.address)
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
        MaticToken.address,
        ethers.constants.One, // TODO: set proper value
        ethers.utils.parseEther('10') // TODO: set proper value
      )

      const lptBalAfter = await MaticToken.balanceOf(deployer)
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
      proxy = (await ethers.getContractAt('EIP173Proxy', Matic.Matic_Proxy.address)) as EIP173Proxy
      beforeBalance = await Tenderizer.currentPrincipal()
      const newFac = await ethers.getContractFactory('Matic', signers[0])
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
      ).withArgs(Matic.Matic_Implementation.address, newTenderizer.address)

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
