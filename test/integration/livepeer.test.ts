import hre, { ethers } from 'hardhat'

import { MockContract, smockit } from '@eth-optimism/smock'

import {
  SimpleToken, Controller, ElasticSupplyPool, TenderToken, ILivepeer, BPool, EIP173Proxy, IOneInch, Livepeer
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

describe('Livepeer Integration Test', () => {
  let LivepeerNoMock: ILivepeer
  let LivepeerMock: MockContract
  let LivepeerToken: SimpleToken
  let OneInchMock: MockContract
  let Controller: Controller
  let Tenderizer: Livepeer
  let TenderToken: TenderToken
  let Esp: ElasticSupplyPool
  let BPool: BPool

  let Livepeer: {[name: string]: Deployment}

  let signers: SignerWithAddress[]
  let deployer: string

  let withdrawAmount: BigNumber

  let tx: ContractTransaction
  const lockID = 1
  const protocolFeesPercent = ethers.utils.parseEther('0.025')
  const liquidityFeesPercent = ethers.utils.parseEther('0.025')

  const acceptableDelta = 2

  before('get signers', async () => {
    const namedAccs = await hre.getNamedAccounts()
    signers = await ethers.getSigners()

    deployer = namedAccs.deployer
  })

  before('deploy Livepeer token', async () => {
    const SimpleTokenFactory = await ethers.getContractFactory(
      'SimpleToken',
      signers[0]
    )

    LivepeerToken = (await SimpleTokenFactory.deploy('Livepeer Token', 'LPT', ethers.utils.parseEther('1000000'))) as SimpleToken
  })

  before('deploy Livepeer', async () => {
    const LivepeerFac = await ethers.getContractFactory(
      'LivepeerMock',
      signers[0]
    )

    LivepeerNoMock = (await LivepeerFac.deploy(LivepeerToken.address)) as ILivepeer

    LivepeerMock = await smockit(LivepeerNoMock)
  })

  before('deploy OneInch Mock', async () => {
    const OneInchFac = await ethers.getContractFactory(
      'OneInchMock',
      signers[0]
    )

    const OneInchNoMock = (await OneInchFac.deploy()) as IOneInch

    OneInchMock = await smockit(OneInchNoMock)
  })

  const STEAK_AMOUNT = '100000'
  const NODE = '0xf4e8Ef0763BCB2B1aF693F5970a00050a6aC7E1B'

  before('deploy Livepeer Tenderizer', async () => {
    process.env.NAME = 'Livepeer'
    process.env.SYMBOL = 'LPT'
    process.env.CONTRACT = LivepeerMock.address
    process.env.TOKEN = LivepeerToken.address
    process.env.VALIDATOR = NODE
    process.env.STEAK_AMOUNT = STEAK_AMOUNT
    Livepeer = await hre.deployments.fixture(['Livepeer'], {
      keepExistingDeployments: false
    })
    console.log(Object.keys(Livepeer))
    Controller = (await ethers.getContractAt('Controller', Livepeer.Controller.address)) as Controller
    Tenderizer = (await ethers.getContractAt('Livepeer', Livepeer.Livepeer.address)) as Livepeer
    TenderToken = (await ethers.getContractAt('TenderToken', Livepeer.TenderToken.address)) as TenderToken
    Esp = (await ethers.getContractAt('ElasticSupplyPool', Livepeer.ElasticSupplyPool.address)) as ElasticSupplyPool
    BPool = (await ethers.getContractAt('BPool', await Esp.bPool())) as BPool
    await Controller.batchExecute(
      [Tenderizer.address, Tenderizer.address, Tenderizer.address],
      [0, 0, 0],
      [Tenderizer.interface.encodeFunctionData('setProtocolFee', [protocolFeesPercent]),
        Tenderizer.interface.encodeFunctionData('setLiquidityFee', [liquidityFeesPercent]),
        Tenderizer.interface.encodeFunctionData('setOneInchContract', [OneInchMock.address])]
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
      before(async () => {
        await LivepeerToken.approve(Controller.address, deposit)
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
    it('bond succeeds', async () => {
      LivepeerMock.smocked.bond.will.return()
      tx = await Controller.gulp()
      expect(LivepeerMock.smocked.bond.calls.length).to.eq(1)
      expect(LivepeerMock.smocked.bond.calls[0]._to).to.eq(NODE)
      // A smocked contract doesn't execute its true code
      // So livepeer.bond() never calls ERC20.transferFrom() under the hood
      // Therefore when we call gulp() it will be for the deposit and bootstrapped supply on deployment
      // Smock doesn't support executing code
      expect(LivepeerMock.smocked.bond.calls[0]._amount).to.eq(deposit.add(initialStake))
    })

    it('emits Stake event from tenderizer', async () => {
      expect(tx).to.emit(Tenderizer, 'Stake').withArgs(NODE, deposit.add(initialStake))
    })

    it('uses specified node if passed, not default', async () => {
      const newNodeAddress = '0xd944a0F8C64D292a94C34e85d9038395e3762751'
      const txData = Tenderizer.interface.encodeFunctionData('stake', [newNodeAddress, ethers.utils.parseEther('0')])
      await Controller.execute(Tenderizer.address, 0, txData)
      expect(LivepeerMock.smocked.bond.calls[0]._to).to.eq(newNodeAddress)
    })

    it('uses specified amount if passed, not contract token balance', async () => {
      const amount = ethers.utils.parseEther('0.1')
      const txData = Tenderizer.interface.encodeFunctionData('stake', [ethers.constants.AddressZero, amount])
      await Controller.execute(Tenderizer.address, 0, txData)
      expect(LivepeerMock.smocked.bond.calls[0]._amount).to.eq(amount)
    })

    it('returns without calling bond() if no balance', async () => {
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [Tenderizer.address]
      }
      )
      const signer = await ethers.provider.getSigner(Tenderizer.address)
      await LivepeerToken.connect(signer).transfer(NODE, deposit.add(initialStake), { gasLimit: 400000, gasPrice: 0 })
      await hre.network.provider.request({
        method: 'hardhat_stopImpersonatingAccount',
        params: [Tenderizer.address]
      }
      )

      await Controller.gulp()
      expect(LivepeerMock.smocked.bond.calls.length).to.eq(0)
    })
  })

  describe('rebase', () => {
    describe('stake increased', () => {
      const increase = ethers.BigNumber.from('10000000000')
      const swappedLPTRewards = ethers.BigNumber.from('100000000')
      const liquidityFees = percOf2(increase.add(swappedLPTRewards), liquidityFeesPercent)
      const protocolFees = percOf2(increase.add(swappedLPTRewards), protocolFeesPercent)
      const newStake = deposit.add(initialStake).add(increase)
      const newStakeMinusFees = newStake.add(swappedLPTRewards).sub(liquidityFees.add(protocolFees))
      const percDiv = ethers.utils.parseEther('1')
      let totalShares: BigNumber = ethers.utils.parseEther('1')

      before(async () => {
        LivepeerMock.smocked.pendingStake.will.return.with(newStake)
        LivepeerMock.smocked.pendingFees.will.return.with(ethers.utils.parseEther('0.1'))
        OneInchMock.smocked.swap.will.return.with(swappedLPTRewards)
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
        const bal = await LivepeerToken.balanceOf(BPool.address)

        const acceptableDelta = ethers.BigNumber.from('100')

        const expected = tBal.mul(percDiv).div(tBal.add(bal))
        const actual = await BPool.getNormalizedWeight(TenderToken.address)
        expect(actual.sub(expected).abs()).to.be.lte(acceptableDelta)
      })

      it('does not withdraw fees is less than threshold', async () => {
        LivepeerMock.smocked.pendingFees.will.return.with(ethers.constants.Zero)
        await Controller.rebase()
        expect(LivepeerMock.smocked.withdrawFees.calls.length).to.eq(0)
      })

      it('should emit RewardsClaimed event from Tenderizer', async () => {
        expect(tx).to.emit(Tenderizer, 'RewardsClaimed')
          .withArgs(increase.add(swappedLPTRewards), newStakeMinusFees, deposit.add(initialStake))
      })
    })

    describe('stake decrease', () => {
      // The decrease will offset the increase from the previous test
      const newStake = deposit.add(initialStake)
      const percDiv = ethers.utils.parseEther('1')
      let totalShares: BigNumber
      let oldPrinciple: BigNumber

      let feesBefore: BigNumber = ethers.constants.Zero

      before(async () => {
        feesBefore = await Tenderizer.pendingFees()
        LivepeerMock.smocked.pendingStake.will.return.with(newStake)
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
        const acceptableDelta = ethers.BigNumber.from('100')

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
      const lptBalBefore = await LivepeerToken.balanceOf(deployer)

      const tenderBal = await BPool.getBalance(TenderToken.address)
      const lptBal = await BPool.getBalance(LivepeerToken.address)
      const tenderWeight = await BPool.getDenormalizedWeight(TenderToken.address)
      const lptWeight = await BPool.getDenormalizedWeight(LivepeerToken.address)
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
        LivepeerToken.address,
        ethers.constants.One, // TODO: set proper value
        ethers.utils.parseEther('10') // TODO: set proper value
      )

      const lptBalAfter = await LivepeerToken.balanceOf(deployer)
      expect(lptBalAfter.sub(lptBalBefore)).to.eq(expOut)
    })
  })

  describe('unlock', async () => {
    before('stake with another account', async () => {
      await LivepeerToken.transfer(signers[2].address, secondDeposit)
      await LivepeerToken.connect(signers[2]).approve(Controller.address, secondDeposit)
      await Controller.connect(signers[2]).deposit(secondDeposit)
    })

    it('reverts if unbond() reverts', async () => {
      LivepeerMock.smocked.unbond.will.revert()
      await expect(Controller.unlock(withdrawAmount)).to.be.reverted
    })

    it('reverts if requested amount exceeds balance', async () => {
      LivepeerMock.smocked.unbond.will.return()
      withdrawAmount = await TenderToken.balanceOf(deployer)
      await expect(Controller.unlock(withdrawAmount.add(ethers.utils.parseEther('1')))).to.be.revertedWith('BURN_AMOUNT_EXCEEDS_BALANCE')
    })

    it('reverts if requested amount is 0', async () => {
      await expect(Controller.unlock(ethers.constants.Zero)).to.be.revertedWith('ZERO_AMOUNT')
    })

    it('unbond() succeeds', async () => {
      tx = await Controller.unlock(withdrawAmount)
      expect(LivepeerMock.smocked.unbond.calls.length).to.eq(1)
      expect(LivepeerMock.smocked.unbond.calls[0]._amount).to.eq(withdrawAmount)
    })

    it('Gov unbond() reverts if no pending stake', async () => {
      const txData = Tenderizer.interface.encodeFunctionData('unstake', [Controller.address, ethers.utils.parseEther('0')])
      LivepeerMock.smocked.pendingStake.will.return.with(ethers.constants.Zero)
      await expect(Controller.execute(Tenderizer.address, 0, txData)).to.be.revertedWith('ZERO_STAKE')
    })

    it('Gov unbond() succeeds', async () => {
      const txData = Tenderizer.interface.encodeFunctionData('unstake', [Controller.address, ethers.utils.parseEther('0')])
      LivepeerMock.smocked.pendingStake.will.return.with(withdrawAmount)
      await Controller.execute(Tenderizer.address, 0, txData)
      expect(LivepeerMock.smocked.unbond.calls.length).to.eq(1)
      expect(LivepeerMock.smocked.unbond.calls[0]._amount).to.eq(withdrawAmount)
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

  describe('withdraw', async () => {
    let lptBalBefore : BigNumber

    it('reverts if wihtdraw() reverts', async () => {
      LivepeerMock.smocked.withdrawStake.will.revert()
      await expect(Controller.withdraw(lockID)).to.be.reverted
    })

    it('withdraw() succeeds', async () => {
      LivepeerMock.smocked.withdrawStake.will.return()
      // Smocked doesn't actually execute transactions, so balance of Controller is not updated
      // hence manually transferring some tokens to simlaute withdrawal
      await LivepeerToken.transfer(Tenderizer.address, withdrawAmount.mul(2))

      lptBalBefore = await LivepeerToken.balanceOf(deployer)

      tx = await Controller.withdraw(lockID)
      expect(LivepeerMock.smocked.withdrawStake.calls.length).to.eq(1)
    })

    it('increases LPT balance', async () => {
      expect(await LivepeerToken.balanceOf(deployer)).to.eq(lptBalBefore.add(withdrawAmount))
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
      proxy = (await ethers.getContractAt('EIP173Proxy', Livepeer.Livepeer_Proxy.address)) as EIP173Proxy
      beforeBalance = await Tenderizer.currentPrincipal()
      const newFac = await ethers.getContractFactory('Livepeer', signers[0])
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
      ).withArgs(Livepeer.Livepeer_Implementation.address, newTenderizer.address)

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
    describe('setting staking contract', () => {
      it('sets staking contract', async () => {
        const newStakingContract = await smockit(LivepeerNoMock)
        const txData = Tenderizer.interface.encodeFunctionData('setStakingContract', [newStakingContract.address])
        tx = await Controller.execute(Tenderizer.address, 0, txData)

        // assert that bond() call is made to new staking contract on gulp()
        await Controller.gulp()
        expect(LivepeerMock.smocked.bond.calls.length).to.eq(0)
        expect(newStakingContract.smocked.bond.calls.length).to.eq(1)
      })

      it('should emit GovernanceUpdate event', async () => {
        expect(tx).to.emit(Tenderizer, 'GovernanceUpdate').withArgs('STAKING_CONTRACT')
      })
    })

    // TODO: Split into common file since these will be the same on all integrations?
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

    describe('setting steak', async () => {
      it('reverts if Zero address is set', async () => {
        const txData = Tenderizer.interface.encodeFunctionData('setSteak', [ethers.constants.AddressZero])
        await expect(Controller.execute(Tenderizer.address, 0, txData)).to.be.revertedWith('ZERO_ADDRESS')
      })

      it('sets steak successfully', async () => {
        const newSteakAddress = '0xd944a0F8C64D292a94C34e85d9038395e3762751'
        const txData = Tenderizer.interface.encodeFunctionData('setSteak', [newSteakAddress])
        tx = await Controller.execute(Tenderizer.address, 0, txData)
        expect(await Tenderizer.steak()).to.equal(newSteakAddress)
      })

      it('should emit GovernanceUpdate event', async () => {
        expect(tx).to.emit(Tenderizer, 'GovernanceUpdate').withArgs('STEAK')
      })
    })

    describe('setting protocol fee', async () => {
      it('sets protocol fee', async () => {
        const newFee = ethers.utils.parseEther('0.05') // 5%
        const txData = Tenderizer.interface.encodeFunctionData('setProtocolFee', [newFee])
        tx = await Controller.execute(Tenderizer.address, 0, txData)
        expect(await Tenderizer.protocolFee()).to.equal(newFee)
      })

      it('should emit GovernanceUpdate event', async () => {
        expect(tx).to.emit(Tenderizer, 'GovernanceUpdate').withArgs('PROTOCOL_FEE')
      })
    })

    describe('setting liquidity fee', async () => {
      it('sets liquidity fee', async () => {
        const newFee = ethers.utils.parseEther('0.05') // 5%
        const txData = Tenderizer.interface.encodeFunctionData('setLiquidityFee', [newFee])
        tx = await Controller.execute(Tenderizer.address, 0, txData)
        expect(await Tenderizer.liquidityFee()).to.equal(newFee)
      })

      it('should emit GovernanceUpdate event', async () => {
        expect(tx).to.emit(Tenderizer, 'GovernanceUpdate').withArgs('LIQUIDITY_FEE')
      })
    })

    describe('setting controller', async () => {
      it('reverts if Zero address is set', async () => {
        const txData = Tenderizer.interface.encodeFunctionData('setController', [ethers.constants.AddressZero])
        await expect(Controller.execute(Tenderizer.address, 0, txData)).to.be.revertedWith('ZERO_ADDRESS')
      })

      it('sets controller successfully', async () => {
        const newControllerAddress = '0xd944a0F8C64D292a94C34e85d9038395e3762751'
        const txData = Tenderizer.interface.encodeFunctionData('setController', [newControllerAddress])
        tx = await Controller.execute(Tenderizer.address, 0, txData)
        expect(await Tenderizer.controller()).to.equal(newControllerAddress)
      })

      it('should emit GovernanceUpdate event', async () => {
        expect(tx).to.emit(Tenderizer, 'GovernanceUpdate').withArgs('CONTROLLER')
      })
    })

    describe('setting esp', async () => {
      it('reverts if Zero address is set', async () => {
        await expect(Controller.setEsp(ethers.constants.AddressZero)).to.be.revertedWith('ZERO_ADDRESS')
      })

      it('sets esp successfully', async () => {
        const newEspAddress = '0xd944a0F8C64D292a94C34e85d9038395e3762751'
        tx = await Controller.setEsp(newEspAddress)
        expect(await Controller.esp()).to.equal(newEspAddress)
      })
    })
  })
})
