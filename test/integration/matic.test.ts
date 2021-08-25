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
import { ContractTransaction } from '@ethersproject/contracts'

import { sharesToTokens, percOf2 } from '../util/helpers'

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

  const exchangeRatePrecision = 100
  const fxRate = 100

  let withdrawAmount: BigNumber

  let tx: ContractTransaction
  const lockID = 1
  const protocolFeesPercent = ethers.utils.parseEther('0.025')
  const liquidityFeesPercent = ethers.utils.parseEther('0.025')

  const acceptableDelta = 2

  let NODE: string

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

    NODE = MaticMock.address
  })

  const STEAK_AMOUNT = '100000'

  before('deploy Matic Tenderizer', async () => {
    process.env.NAME = 'Matic'
    process.env.SYMBOL = 'MATIC'
    process.env.VALIDATOR = MaticMock.address
    process.env.TOKEN = MaticToken.address
    process.env.CONTRACT = '0x0000000000000000000000000000000000000101' // dummy
    process.env.STEAK_AMOUNT = STEAK_AMOUNT
    Matic = await hre.deployments.fixture(['Matic'], {
      keepExistingDeployments: false
    })
    Controller = (await ethers.getContractAt('Controller', Matic.Controller.address)) as Controller
    Tenderizer = (await ethers.getContractAt('Tenderizer', Matic.Matic.address)) as Tenderizer
    TenderToken = (await ethers.getContractAt('TenderToken', Matic.TenderToken.address)) as TenderToken
    Esp = (await ethers.getContractAt('ElasticSupplyPool', Matic.ElasticSupplyPool.address)) as ElasticSupplyPool
    BPool = (await ethers.getContractAt('BPool', await Esp.bPool())) as BPool
    await Controller.batchExecute(
      [Tenderizer.address, Tenderizer.address],
      [0, 0],
      [Tenderizer.interface.encodeFunctionData('setProtocolFee', [protocolFeesPercent]),
        Tenderizer.interface.encodeFunctionData('setLiquidityFee', [liquidityFeesPercent])]
    )
  })

  const initialStake = ethers.utils.parseEther(STEAK_AMOUNT).div('2')

  const deposit = ethers.utils.parseEther('100')
  const secondDeposit = ethers.utils.parseEther('10')

  describe('deposit', () => {
    it('reverts because transfer amount exceeds allowance', async () => {
      await expect(Controller.deposit(deposit)).to.be.revertedWith('ERC20: transfer amount exceeds allowance')
    })

    describe('deposits funds succesfully', async () => {
      let tx: ContractTransaction
      before(async () => {
        await MaticToken.approve(Controller.address, deposit)
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
    let tx: ContractTransaction
    it('bond succeeds', async () => {
      MaticMock.smocked.validatorId.will.return.with(1)
      MaticMock.smocked.exchangeRate.will.return.with(fxRate)
      MaticMock.smocked.buyVoucher.will.return()
      tx = await Controller.gulp()
      expect(MaticMock.smocked.buyVoucher.calls.length).to.eq(1)
      // A smocked contract doesn't execute its true code
      // So matic.buyVoucher() never calls ERC20.transferFrom() under the hood
      // Therefore when we call gulp() it will be for the deposit and bootstrapped supply on deployment
      // Smock doesn't support executing code
      const minSharesToMint = deposit.add(initialStake).mul(exchangeRatePrecision).div(fxRate).sub(1)
      expect(MaticMock.smocked.buyVoucher.calls[0]._amount).to.eq(deposit.add(initialStake))
      expect(MaticMock.smocked.buyVoucher.calls[0]._minSharesToMint).to.eq(minSharesToMint)
    })

    it('emits Stake event from tenderizer', async () => {
      expect(tx).to.emit(Tenderizer, 'Stake').withArgs(MaticMock.address, deposit.add(initialStake))
    })

    it('uses specified node if passed, not default', async () => {
      const newValidatorShare = await smockit(MaticNoMock)
      newValidatorShare.smocked.buyVoucher.will.return()
      const newNodeAddress = newValidatorShare.address
      const txData = Tenderizer.interface.encodeFunctionData('stake', [newNodeAddress, ethers.utils.parseEther('0')])
      await Controller.execute(Tenderizer.address, 0, txData)
      expect(MaticMock.smocked.buyVoucher.calls.length).to.eq(0)
      expect(newValidatorShare.smocked.buyVoucher.calls.length).to.eq(1)
    })

    it('uses specified amount if passed, not contract token balance', async () => {
      const amount = ethers.utils.parseEther('0.1')
      const txData = Tenderizer.interface.encodeFunctionData('stake', [ethers.constants.AddressZero, amount])
      await Controller.execute(Tenderizer.address, 0, txData)
      expect(MaticMock.smocked.buyVoucher.calls[0]._amount).to.eq(amount)
    })

    it('returns without calling buyVoucher() if no balance', async () => {
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [Tenderizer.address]
      }
      )
      const signer = await ethers.provider.getSigner(Tenderizer.address)
      await MaticToken.connect(signer).transfer(NODE, deposit.add(initialStake), { gasLimit: 400000, gasPrice: 0 })
      await hre.network.provider.request({
        method: 'hardhat_stopImpersonatingAccount',
        params: [Tenderizer.address]
      }
      )

      await Controller.gulp()
      expect(MaticMock.smocked.buyVoucher.calls.length).to.eq(0)
    })
  })

  describe('rebase', () => {
    const increase = ethers.BigNumber.from('10000000000')
    const liquidityFees = percOf2(increase, liquidityFeesPercent)
    const protocolFees = percOf2(increase, protocolFeesPercent)
    const newStake = deposit.add(initialStake).add(increase)
    const newStakeMinusFees = newStake.sub(liquidityFees.add(protocolFees))
    const percDiv = ethers.utils.parseEther('1')
    let totalShares: BigNumber

    describe('stake increased', () => {
      totalShares = ethers.utils.parseEther('1')
      let tx: ContractTransaction

      before(async () => {
        totalShares = await TenderToken.getTotalShares()
        MaticMock.smocked.balanceOf.will.return.with(newStake)
        MaticMock.smocked.exchangeRate.will.return.with(fxRate)
        tx = await Controller.rebase()
      })

      it('updates currentPrincipal', async () => {
        expect(await Tenderizer.currentPrincipal()).to.eq(newStakeMinusFees)
      })

      it('increases tendertoken balances when rewards are added', async () => {
        // account 0
        const shares = await TenderToken.sharesOf(deployer)
        totalShares = await TenderToken.getTotalShares()
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

      it('should emit RewardsClaimed event from Tenderizer', async () => {
        expect(tx).to.emit(Tenderizer, 'RewardsClaimed').withArgs(increase, newStakeMinusFees, deposit.add(initialStake))
      })
    })

    describe('stake decrease', () => {
      // The decrease will offset the increase from the previous test
      const newStake = deposit.add(initialStake)
      const percDiv = ethers.utils.parseEther('1')
      let totalShares: BigNumber
      let oldPrinciple: BigNumber

      let feesBefore: BigNumber = ethers.constants.Zero
      let tx: ContractTransaction

      before(async () => {
        feesBefore = await Tenderizer.pendingFees()
        MaticMock.smocked.balanceOf.will.return.with(newStake)
        MaticMock.smocked.exchangeRate.will.return.with(fxRate)
        oldPrinciple = await Tenderizer.currentPrincipal()
        tx = await Controller.rebase()
      })

      it('updates currentPrincipal', async () => {
        expect(await Tenderizer.currentPrincipal()).to.eq(newStake)
      })

      it('decreases tendertoken balances when slashed', async () => {
        // account 0
        const shares = await TenderToken.sharesOf(deployer)
        totalShares = await TenderToken.getTotalShares()
        expect(await TenderToken.balanceOf(deployer)).to.eq(sharesToTokens(shares, totalShares, await TenderToken.totalSupply()))
      })

      it("doesn't increase pending fees", async () => {
        expect(await Tenderizer.pendingFees()).to.eq(feesBefore)
      })

      it('decreases the tenderToken balance of the AMM', async () => {
        const shares = await TenderToken.sharesOf(BPool.address)
        expect(await TenderToken.balanceOf(BPool.address)).to.eq(sharesToTokens(shares, totalShares, await TenderToken.totalSupply()))
      })

      it('changes the weights of the AMM', async () => {
        const acceptableDelta = ethers.BigNumber.from('10')

        const expected = percDiv.div(2)
        const actual = await BPool.getNormalizedWeight(TenderToken.address)
        expect(actual.sub(expected).abs()).to.be.lte(acceptableDelta)
      })

      it('should emit RewardsClaimed event from Tenderizer with 0 rewards and currentPrinciple', async () => {
        expect(tx).to.emit(Tenderizer, 'RewardsClaimed').withArgs('0', newStake, oldPrinciple)
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
      const newBalance = await TenderToken.balanceOf(deployer)
      const acceptableDelta = ethers.BigNumber.from('10')

      expect(newBalance.sub(ownerBalBefore.add(fees)).abs()).to.be.lte(acceptableDelta)
    })

    it('should emit ProtocolFeeCollected event from Tenderizer', async () => {
      expect(tx).to.emit(Tenderizer, 'ProtocolFeeCollected').withArgs(fees)
    })
  })

  describe('collect liquidity fees', () => {
    let fees: BigNumber
    let farmBalanceBefore: BigNumber
    let mockTenderFarm : SignerWithAddress

    before(async () => {
      mockTenderFarm = signers[3]
      fees = await Tenderizer.pendingLiquidityFees()
      farmBalanceBefore = await TenderToken.balanceOf(mockTenderFarm.address)
      tx = await Controller.collectLiquidityFees()
    })

    it('should reset pendingFees', async () => {
      expect(await Tenderizer.pendingLiquidityFees()).to.eq(ethers.constants.Zero)
    })

    it('should increase tenderToken balance of tenderFarm', async () => {
      expect(await TenderToken.balanceOf(mockTenderFarm.address)).to.eq(farmBalanceBefore.add(fees))
    })

    it('should emit ProtocolFeeCollected event from Tenderizer', async () => {
      expect(tx).to.emit(Tenderizer, 'LiquidityFeeCollected').withArgs(fees)
    })
  })

  describe('swap against ESP', () => {
    it('swaps tenderToken for Token', async () => {
      const amount = deposit.div(2)
      const matBalBefore = await MaticToken.balanceOf(deployer)

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
      expect(lptBalAfter.sub(matBalBefore)).to.eq(expOut)
    })
  })

  describe('unlock', () => {
    before('stake with another account', async () => {
      await MaticToken.transfer(signers[2].address, secondDeposit)
      await MaticToken.connect(signers[2]).approve(Controller.address, secondDeposit)
      await Controller.connect(signers[2]).deposit(secondDeposit)
    })

    it('reverts if unbond() reverts', async () => {
      MaticMock.smocked.sellVoucher_new.will.revert()
      await expect(Controller.unlock(withdrawAmount)).to.be.reverted
    })

    it('reverts if requested amount exceeds balance', async () => {
      MaticMock.smocked.sellVoucher_new.will.return()
      withdrawAmount = await TenderToken.balanceOf(deployer)
      await expect(Controller.unlock(withdrawAmount.add(ethers.utils.parseEther('1')))).to.be.revertedWith('BURN_AMOUNT_EXCEEDS_BALANCE')
    })

    it('reverts if requested amount is 0', async () => {
      await expect(Controller.unlock(ethers.constants.Zero)).to.be.revertedWith('ZERO_AMOUNT')
    })

    it('sellVoucher() succeeds', async () => {
      tx = await Controller.unlock(withdrawAmount)
      const maxSharesToBurn = withdrawAmount.mul(exchangeRatePrecision).div(fxRate).add(1)
      expect(MaticMock.smocked.sellVoucher_new.calls.length).to.eq(1)
      expect(MaticMock.smocked.sellVoucher_new.calls[0]._claimAmount).to.eq(withdrawAmount)
      expect(MaticMock.smocked.sellVoucher_new.calls[0]._maximumSharesToBurn).to.eq(maxSharesToBurn)
    })

    it('Gov sellVoucher() reverts if no pending stake', async () => {
      const txData = Tenderizer.interface.encodeFunctionData('unstake', [Controller.address, ethers.utils.parseEther('0')])
      MaticMock.smocked.balanceOf.will.return.with(ethers.constants.Zero)
      MaticMock.smocked.exchangeRate.will.return.with(fxRate)
      await expect(Controller.execute(Tenderizer.address, 0, txData)).to.be.revertedWith('ZERO_STAKE')
    })

    it('Gov sellVoucher() succeeds', async () => {
      const txData = Tenderizer.interface.encodeFunctionData('unstake', [Controller.address, ethers.utils.parseEther('0')])
      MaticMock.smocked.balanceOf.will.return.with(withdrawAmount)
      MaticMock.smocked.exchangeRate.will.return.with(fxRate)
      await Controller.execute(Tenderizer.address, 0, txData)
      expect(MaticMock.smocked.sellVoucher_new.calls.length).to.eq(1)
      expect(MaticMock.smocked.sellVoucher_new.calls[0]._claimAmount).to.eq(withdrawAmount)
    })

    it('reduces TenderToken Balance', async () => {
      // lte to account for any roundoff error in tokenToShare calcualtion during burn
      expect(await TenderToken.balanceOf(deployer)).to.lte(acceptableDelta)
    })

    it('should create unstakeLock', async () => {
      const lock = await Tenderizer.unstakeLocks(lockID)
      expect(lock.account).to.eq(deployer)
      expect(lock.amount).to.eq(withdrawAmount)
    })

    it('should emit Unstake event from Tenderizer', async () => {
      expect(tx).to.emit(Tenderizer, 'Unstake').withArgs(deployer, NODE, withdrawAmount, lockID)
    })
  })

  describe('withdraw', () => {
    let matBalBefore : BigNumber

    it('reverts if wihtdraw() reverts', async () => {
      MaticMock.smocked.unstakeClaimTokens_new.will.revert()
      await expect(Controller.withdraw(lockID)).to.be.reverted
    })

    it('withdraw() succeeds', async () => {
      MaticMock.smocked.unstakeClaimTokens_new.will.return()
      // Smocked doesn't actually execute transactions, so balance of Controller is not updated
      // hence manually transferring some tokens to simlaute withdrawal
      await MaticToken.transfer(Tenderizer.address, withdrawAmount.mul(2))

      matBalBefore = await MaticToken.balanceOf(deployer)

      tx = await Controller.withdraw(lockID)
      expect(MaticMock.smocked.unstakeClaimTokens_new.calls.length).to.eq(1)
    })

    it('increases LPT balance', async () => {
      expect(await MaticToken.balanceOf(deployer)).to.eq(matBalBefore.add(withdrawAmount))
    })

    it('TenderToken balance of other account stays the same', async () => {
      const balOtherAcc = await TenderToken.balanceOf(signers[2].address)
      expect(balOtherAcc.sub(secondDeposit).abs()).to.lte(acceptableDelta)
    })

    it('should delete unstakeLock', async () => {
      const lock = await Tenderizer.unstakeLocks(lockID)
      expect(lock.account).to.eq(ethers.constants.AddressZero)
      expect(lock.amount).to.eq(0)
    })

    it('should emit Withdraw event from Tenderizer', async () => {
      expect(tx).to.emit(Tenderizer, 'Withdraw').withArgs(deployer, withdrawAmount, lockID)
    })
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

  describe('Setting contract variables', async () => {
    describe('setting node', async () => {
      it('reverts if Zero address is set', async () => {
        const txData = Tenderizer.interface.encodeFunctionData('setNode', [ethers.constants.AddressZero])
        await expect(Controller.execute(Tenderizer.address, 0, txData)).to.be.revertedWith('ZERO_ADDRESS')
      })

      it('reverts if not called by controller', async () => {
        await expect(Tenderizer.setNode(ethers.constants.AddressZero)).to.be.reverted
      })

      it('sets node successfully', async () => {
        const newNodeAddress = '0xd944a0F8C64D292a94C34e85d9038395e3762751'
        const txData = Tenderizer.interface.encodeFunctionData('setNode', [newNodeAddress])
        tx = await Controller.execute(Tenderizer.address, 0, txData)
        expect(await Tenderizer.node()).to.equal(newNodeAddress)
      })

      it('should emit GovernanceUpdate event', async () => {
        expect(tx).to.emit(Tenderizer, 'GovernanceUpdate').withArgs('NODE')
      })
    })
  })
})
