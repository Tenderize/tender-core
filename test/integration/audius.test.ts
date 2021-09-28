import hre, { ethers } from 'hardhat'

import { MockContract, smockit } from '@eth-optimism/smock'

import {
  SimpleToken, Controller, Tenderizer, ElasticSupplyPool, TenderToken, IAudius, BPool, EIP173Proxy
} from '../../typechain/'

import { sharesToTokens, percOf2 } from '../util/helpers'

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

describe('Audius Integration Test', () => {
  let AudiusNoMock: IAudius
  let AudiusMock: MockContract
  let AudiusToken: SimpleToken
  let Controller: Controller
  let Tenderizer: Tenderizer
  let TenderToken: TenderToken
  let Esp: ElasticSupplyPool
  let BPool: BPool

  let Audius: {[name: string]: Deployment}

  let signers: SignerWithAddress[]
  let deployer: string

  let withdrawAmount: BigNumber
  let tx: ContractTransaction
  const unbondLockID = 0
  const govUnboundLockID = 1

  const protocolFeesPercent = ethers.utils.parseEther('0.025')
  const liquidityFeesPercent = ethers.utils.parseEther('0.025')

  const acceptableDelta = 2

  const dummyStakingAddress = '0xfA668FB97697200FA56ce98E246db61Cc7E14Bd5'

  before('get signers', async () => {
    const namedAccs = await hre.getNamedAccounts()
    signers = await ethers.getSigners()

    deployer = namedAccs.deployer
  })

  before('deploy Audius token', async () => {
    const SimpleTokenFactory = await ethers.getContractFactory(
      'SimpleToken',
      signers[0]
    )

    AudiusToken = (await SimpleTokenFactory.deploy('Audius Token', 'AUDIO', ethers.utils.parseEther('1000000'))) as SimpleToken
  })

  before('deploy Audius', async () => {
    const AudiusFac = await ethers.getContractFactory(
      'AudiusMock',
      signers[0]
    )

    AudiusNoMock = (await AudiusFac.deploy(AudiusToken.address)) as IAudius

    AudiusMock = await smockit(AudiusNoMock)
  })

  const STEAK_AMOUNT = '100000'
  const NODE = '0xf4e8Ef0763BCB2B1aF693F5970a00050a6aC7E1B'

  before('deploy Audius Tenderizer', async () => {
    process.env.NAME = 'Audius'
    process.env.SYMBOL = 'AUDIO'
    process.env.CONTRACT = AudiusMock.address
    process.env.TOKEN = AudiusToken.address
    process.env.VALIDATOR = NODE
    process.env.STEAK_AMOUNT = STEAK_AMOUNT
    AudiusMock.smocked.getStakingAddress.will.return.with(dummyStakingAddress)

    Audius = await hre.deployments.fixture(['Audius'], {
      keepExistingDeployments: false
    })
    Controller = (await ethers.getContractAt('Controller', Audius.Controller.address)) as Controller
    Tenderizer = (await ethers.getContractAt('Tenderizer', Audius.Audius.address)) as Tenderizer
    TenderToken = (await ethers.getContractAt('TenderToken', Audius.TenderToken.address)) as TenderToken
    Esp = (await ethers.getContractAt('ElasticSupplyPool', Audius.ElasticSupplyPool.address)) as ElasticSupplyPool
    BPool = (await ethers.getContractAt('BPool', await Esp.bPool())) as BPool
    await Controller.execute(
      Tenderizer.address,
      0,
      Tenderizer.interface.encodeFunctionData('setProtocolFee', [protocolFeesPercent])
    )
    await Controller.execute(
      Tenderizer.address,
      0,
      Tenderizer.interface.encodeFunctionData('setLiquidityFee', [liquidityFeesPercent])
    )
  })

  const initialStake = ethers.utils.parseEther(STEAK_AMOUNT).div('2')

  const deposit = ethers.utils.parseEther('100')
  const secondDeposit = ethers.utils.parseEther('10')

  describe('deposit', () => {
    describe('deposits funds succesfully', async () => {
      let tx: ContractTransaction
      before(async () => {
        await AudiusToken.approve(Controller.address, deposit)
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
      it('delegateStake succeeds', async () => {
        AudiusMock.smocked.delegateStake.will.return.with(deposit.add(initialStake))
        tx = await Controller.gulp()
        expect(AudiusMock.smocked.delegateStake.calls.length).to.eq(1)
        expect(AudiusMock.smocked.delegateStake.calls[0]._targetSP).to.eq(NODE)
        // A smocked contract doesn't execute its true code
        // So livepeer.bond() never calls ERC20.transferFrom() under the hood
        // Therefore when we call gulp() it will be for the deposit and bootstrapped supply on deployment
        // Smock doesn't support executing code
        expect(AudiusMock.smocked.delegateStake.calls[0]._amount).to.eq(deposit.add(initialStake))
      })

      it('emits Stake event from tenderizer', async () => {
        expect(tx).to.emit(Tenderizer, 'Stake').withArgs(NODE, deposit.add(initialStake))
      })
    })
  })

  describe('rebase', () => {
    describe('stake increased', () => {
      const increase = ethers.BigNumber.from('10000000000')
      const liquidityFees = percOf2(increase, liquidityFeesPercent)
      const protocolFees = percOf2(increase, protocolFeesPercent)
      const newStake = deposit.add(initialStake).add(increase)
      const newStakeMinusFees = newStake.sub(liquidityFees.add(protocolFees))
      let totalShares: BigNumber = ethers.utils.parseEther('1')
      let tx: ContractTransaction

      before(async () => {
        totalShares = await TenderToken.getTotalShares()
        AudiusMock.smocked.getTotalDelegatorStake.will.return.with(newStake)
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

      it('steak balance stays the same', async () => {
        expect(await AudiusToken.balanceOf(BPool.address)).to.eq(initialStake)
      })

      it('weights of the AMM stay 50-50', async () => {
        expect(await BPool.getNormalizedWeight(TenderToken.address)).to.be.eq(ethers.utils.parseEther('1').div(2))
      })

      it('should emit RewardsClaimed event from Tenderizer', async () => {
        expect(tx).to.emit(Tenderizer, 'RewardsClaimed').withArgs(increase, newStakeMinusFees, deposit.add(initialStake))
      })
    })

    describe('stake decrease', () => {
      // The decrease will offset the increase from the previous test
      const newStake = deposit.add(initialStake)
      let totalShares: BigNumber
      let oldPrinciple: BigNumber

      let feesBefore: BigNumber = ethers.constants.Zero
      let tx: ContractTransaction

      before(async () => {
        feesBefore = await Tenderizer.pendingFees()
        oldPrinciple = await Tenderizer.currentPrincipal()
        AudiusMock.smocked.getTotalDelegatorStake.will.return.with(newStake)
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

      it('steak balance stays the same', async () => {
        expect(await AudiusToken.balanceOf(BPool.address)).to.eq(initialStake)
      })

      it('weights of the AMM stay 50-50', async () => {
        expect(await BPool.getNormalizedWeight(TenderToken.address)).to.be.eq(ethers.utils.parseEther('1').div(2))
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
      expect(await TenderToken.balanceOf(deployer)).to.eq(ownerBalBefore.add(fees))
    })

    it('should emit ProtocolFeeCollected event from Tenderizer', async () => {
      expect(tx).to.emit(Tenderizer, 'ProtocolFeeCollected').withArgs(fees)
    })
  })

  describe('swap against ESP', () => {
    it('swaps tenderToken for Token', async () => {
      const amount = deposit.div(2)
      const lptBalBefore = await AudiusToken.balanceOf(deployer)

      const tenderBal = await BPool.getBalance(TenderToken.address)
      const lptBal = await BPool.getBalance(AudiusToken.address)
      const tenderWeight = await BPool.getDenormalizedWeight(TenderToken.address)
      const lptWeight = await BPool.getDenormalizedWeight(AudiusToken.address)
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
        AudiusToken.address,
        ethers.constants.One, // TODO: set proper value
        ethers.utils.parseEther('10') // TODO: set proper value
      )

      const lptBalAfter = await AudiusToken.balanceOf(deployer)
      expect(lptBalAfter.sub(lptBalBefore)).to.eq(expOut)
    })
  })

  describe('unlock', () => {
    before('stake with another account', async () => {
      await AudiusToken.transfer(signers[2].address, secondDeposit)
      await AudiusToken.connect(signers[2]).approve(Controller.address, secondDeposit)
      await Controller.connect(signers[2]).deposit(secondDeposit)
    })

    describe('user unlock', async () => {
      it('reverts if user does not have enough tender token balance', async () => {
        withdrawAmount = await TenderToken.balanceOf(deployer)
        await expect(Controller.unlock(withdrawAmount.add(ethers.utils.parseEther('1')))).to.be.revertedWith('BURN_AMOUNT_EXCEEDS_BALANCE')
      })

      it('on success - updates current pricinple', async () => {
        const principleBefore = await Tenderizer.currentPrincipal()
        tx = await Controller.unlock(withdrawAmount)
        expect(await Tenderizer.currentPrincipal()).to.eq(principleBefore.sub(withdrawAmount))
      })

      it('reduces TenderToken Balance', async () => {
        // lte to account for any roundoff error in tokenToShare calcualtion during burn
        expect(await TenderToken.balanceOf(deployer)).to.lte(acceptableDelta)
      })

      it('TenderToken balance of other account stays the same', async () => {
        const otherAccBal = await TenderToken.balanceOf(signers[2].address)
        expect(otherAccBal.sub(secondDeposit).abs()).to.lte(acceptableDelta)
      })

      it('should create unstakeLock', async () => {
        const lock = await Tenderizer.unstakeLocks(unbondLockID)
        expect(lock.account).to.eq(deployer)
        expect(lock.amount.sub(withdrawAmount).abs()).to.lte(acceptableDelta)
      })

      it('should emit Unstake event from Tenderizer', async () => {
        expect(tx).to.emit(Tenderizer, 'Unstake').withArgs(deployer, NODE, withdrawAmount, unbondLockID)
      })
    })

    describe('gov unlock', async () => {
      it('reverts if requestUndelegateStake() reverts', async () => {
        AudiusMock.smocked.requestUndelegateStake.will.revert()
        const txData = ethers.utils.arrayify(Tenderizer.interface.encodeFunctionData('unstake',
          [Controller.address, ethers.utils.parseEther('0')]))
        await expect(Controller.execute(Tenderizer.address, 0, txData)).to.be.reverted
      })

      it('requestUndelegateStake() suceeds', async () => {
        AudiusMock.smocked.requestUndelegateStake.will.return()
        // TODO: Verify calculations
        AudiusMock.smocked.getTotalDelegatorStake.will.return.with(withdrawAmount)
        const txData = ethers.utils.arrayify(Tenderizer.interface.encodeFunctionData('unstake',
          [Controller.address, ethers.utils.parseEther('0')]))
        tx = await Controller.execute(Tenderizer.address, 0, txData)
        expect(AudiusMock.smocked.requestUndelegateStake.calls.length).to.eq(1)
        expect(AudiusMock.smocked.requestUndelegateStake.calls[0]._target).to.eq(NODE)
        expect(AudiusMock.smocked.requestUndelegateStake.calls[0]._amount).to.eq(withdrawAmount)
      })

      it('should emit Unstake event from Tenderizer', async () => {
        expect(tx).to.emit(Tenderizer, 'Unstake').withArgs(Controller.address, NODE, withdrawAmount, govUnboundLockID)
      })
    })
  })

  describe('withdraw', () => {
    describe('gov withdrawal', async () => {
      // TODO: restructure
      it('user withdrawal reverts if gov withdrawal pending', async () => {
        await expect(Controller.withdraw(unbondLockID)).to.be.revertedWith('GOV_WITHDRAW_PENDING')
      })

      it('reverts if undelegateStake() reverts', async () => {
        AudiusMock.smocked.undelegateStake.will.revert()
        const txData = ethers.utils.arrayify(Tenderizer.interface.encodeFunctionData('withdraw',
          [Controller.address, govUnboundLockID]))
        await expect(Controller.execute(Tenderizer.address, 0, txData)).to.be.reverted
      })

      it('undelegateStake() succeeds', async () => {
        AudiusMock.smocked.undelegateStake.will.return()
        const txData = ethers.utils.arrayify(Tenderizer.interface.encodeFunctionData('withdraw',
          [Controller.address, govUnboundLockID]))
        tx = await Controller.execute(Tenderizer.address, 0, txData)
        expect(AudiusMock.smocked.undelegateStake.calls.length).to.eq(1)
      })

      it('should emit Withdraw event from Tenderizer', async () => {
        expect(tx).to.emit(Tenderizer, 'Withdraw').withArgs(Controller.address, withdrawAmount, govUnboundLockID)
      })
    })

    describe('user withdrawal', async () => {
      let AUDIOBalanceBefore : BigNumber
      it('reverts if account mismatch from unboondigLock', async () => {
        await expect(Controller.connect(signers[1]).withdraw(unbondLockID))
          .to.be.revertedWith('ACCOUNT_MISTMATCH')
      })

      it('success - increases AUDIO balance', async () => {
        AUDIOBalanceBefore = await AudiusToken.balanceOf(deployer)
        tx = await Controller.withdraw(unbondLockID)
        expect(await AudiusToken.balanceOf(deployer)).to.eq(AUDIOBalanceBefore.add(withdrawAmount))
      })

      it('should delete unstakeLock', async () => {
        const lock = await Tenderizer.unstakeLocks(unbondLockID)
        expect(lock.account).to.eq(ethers.constants.AddressZero)
        expect(lock.amount).to.eq(0)
      })

      it('should emit Withdraw event from Tenderizer', async () => {
        expect(tx).to.emit(Tenderizer, 'Withdraw').withArgs(deployer, withdrawAmount, unbondLockID)
      })
    })
  })

  describe('upgrade', () => {
    let proxy: EIP173Proxy
    let newTenderizer:any
    let beforeBalance: BigNumber
    before(async () => {
      proxy = (await ethers.getContractAt('EIP173Proxy', Audius.Audius_Proxy.address)) as EIP173Proxy
      beforeBalance = await Tenderizer.currentPrincipal()
      const newFac = await ethers.getContractFactory('Audius', signers[0])
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
      ).withArgs(Audius.Audius_Implementation.address, newTenderizer.address)

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
        const newStakingContract = await smockit(AudiusNoMock)
        newStakingContract.smocked.getStakingAddress.will.return.with(dummyStakingAddress)
        const txData = Tenderizer.interface.encodeFunctionData('setStakingContract', [newStakingContract.address])
        tx = await Controller.execute(Tenderizer.address, 0, txData)

        // assert that bond() call is made to new staking contract on gulp()
        await Controller.gulp()
        expect(AudiusMock.smocked.delegateStake.calls.length).to.eq(0)
        expect(newStakingContract.smocked.delegateStake.calls.length).to.eq(1)
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
