import hre, { ethers } from 'hardhat'

import {
  Controller, ElasticSupplyPool, TenderToken, IAudius, BPool, Audius, ERC20
} from '../../typechain'

import claimsManagerAbi from './abis/audius/ClaimsManager.json'
import govAbi from './abis/audius/Governance.json'

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

describe('Audius Mainnet Fork Test', () => {
  let AudiusStaking: IAudius
  let AudiusToken: ERC20
  let Controller: Controller
  let Tenderizer: Audius
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

  before('get signers', async () => {
    const namedAccs = await hre.getNamedAccounts()
    signers = await ethers.getSigners()

    deployer = namedAccs.deployer
  })

  const STEAK_AMOUNT = '100000'
  const NODE = '0x0C3523357Fe79cC6348902A956d561be6039f462'

  const delegateManagerAddr = '0x4d7968ebfD390D5E7926Cb3587C39eFf2F9FB225'
  const claimsManagerAddr = '0x44617F9dCEd9787C3B06a05B35B4C779a2AA1334'
  const govAddr = '0x4DEcA517D6817B6510798b7328F2314d3003AbAC'
  const guardianAddr = '0x7eE3c2091471474c9c4831A550f1a79DaBA0CcEf'
  const AUDIOHolder = '0x9416fd2bc773c85a65d699ca9fc9525f1424df94'

  const undelegateStakeRequestedTopic = '0x0c0ebdfe3f3ccdb3ad070f98a3fb9656a7b8781c299a5c0cd0f37e4d5a02556d'

  const testTimeout = 1200000

  before('deploy Audius Tenderizer', async function () {
    this.timeout(testTimeout)
    // Fork from mainnet
    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [{
        forking: {
          jsonRpcUrl: process.env.ALCHEMY_URL || 'https://eth-mainnet.alchemyapi.io/v2/s93KFT7TnttkCPdNS2Fg_HAoCpP6dEda'
        }
      }]
    })

    process.env.NAME = 'Audius'
    process.env.SYMBOL = 'AUDIO'
    process.env.CONTRACT = delegateManagerAddr
    process.env.TOKEN = '0x18aaa7115705e8be94bffebde57af9bfc265b998'
    process.env.VALIDATOR = NODE
    process.env.BFACTORY = '0x9424B1412450D0f8Fc2255FAf6046b98213B76Bd'
    process.env.B_SAFEMATH = '0xCfE28868F6E0A24b7333D22D8943279e76aC2cdc'
    process.env.B_RIGHTS_MANAGER = '0xCfE28868F6E0A24b7333D22D8943279e76aC2cdc'
    process.env.B_SMART_POOL_MANAGER = '0xA3F9145CB0B50D907930840BB2dcfF4146df8Ab4'
    process.env.STEAK_AMOUNT = STEAK_AMOUNT

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [AUDIOHolder]
    })
    const AUDIOHolderSigner = await ethers.provider.getSigner(AUDIOHolder)

    // Transfer some ETH to Gov to execute txs
    const ETHHolder = '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8'
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ETHHolder]
    })
    await hre.web3.eth.sendTransaction({ from: ETHHolder, to: guardianAddr, value: ethers.utils.parseEther('10').toString() })

    // Transfer some AUDIO
    AudiusToken = (await ethers.getContractAt('ERC20', process.env.TOKEN)) as ERC20
    await AudiusToken.connect(AUDIOHolderSigner).transfer(deployer, ethers.utils.parseEther(process.env.STEAK_AMOUNT).mul(2))

    AudiusStaking = (await ethers.getContractAt('IAudius', process.env.CONTRACT)) as IAudius

    Audius = await hre.deployments.fixture(['Audius'], {
      keepExistingDeployments: false
    })
    Controller = (await ethers.getContractAt('Controller', Audius.Controller.address)) as Controller
    Tenderizer = (await ethers.getContractAt('Audius', Audius.Audius.address)) as Audius
    TenderToken = (await ethers.getContractAt('TenderToken', Audius.TenderToken.address)) as TenderToken
    Esp = (await ethers.getContractAt('ElasticSupplyPool', Audius.ElasticSupplyPool.address)) as ElasticSupplyPool
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

  describe('deposit', () => {
    it('reverts because transfer amount exceeds allowance', async () => {
      await expect(Controller.deposit(deposit)).to.be.reverted
    })

    describe('deposits funds succesfully', async () => {
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
    before(async () => {
      tx = await Controller.gulp()
    })

    it('bond succeeds', async () => {
      expect(await AudiusStaking.getTotalDelegatorStake(Tenderizer.address)).to.eq(deposit.add(initialStake))
    })

    it('emits Stake event from tenderizer', async () => {
      expect(tx).to.emit(Tenderizer, 'Stake').withArgs(NODE, deposit)
    })
  })

  describe('rebase', () => {
    let increase: BigNumber
    describe('stake increased', () => {
      let newStakeMinusFees: BigNumber
      let newStake: BigNumber
      let totalShares: BigNumber = ethers.utils.parseEther('1')

      before(async function () {
        this.timeout(testTimeout * 10)
        const claimsManager = new ethers.Contract(claimsManagerAddr, claimsManagerAbi, ethers.provider)

        const stakeBefore = await AudiusStaking.getTotalDelegatorStake(Tenderizer.address)

        // Mine blocks so new round can be initiated
        // Rounds can be initiated only once per week
        for (let j = 0; j < 40000; j++) {
          await hre.ethers.provider.send('evm_mine', [])
        }

        // Initiate new round and distribute rewards
        await hre.network.provider.request({
          method: 'hardhat_impersonateAccount',
          params: [NODE]
        })
        const nodeSigner = await ethers.provider.getSigner(NODE)
        await claimsManager.connect(nodeSigner).initiateRound()

        tx = await Controller.rebase()
        const stakeAfter = await AudiusStaking.getTotalDelegatorStake(Tenderizer.address)
        increase = stakeAfter.sub(stakeBefore)
        const liquidityFees = percOf2(increase, liquidityFeesPercent)
        const protocolFees = percOf2(increase, protocolFeesPercent)
        newStake = deposit.add(initialStake).add(increase)
        newStakeMinusFees = newStake.sub(liquidityFees.add(protocolFees))
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

      it('weights of the AMM stay 50-50', async () => {
        expect(await BPool.getNormalizedWeight(TenderToken.address)).to.be.eq(ethers.utils.parseEther('1').div(2))
      })

      it('should emit RewardsClaimed event from Tenderizer', async () => {
        expect(tx).to.emit(Tenderizer, 'RewardsClaimed')
          .withArgs(increase, newStakeMinusFees, deposit.add(initialStake))
      })
    })

    describe('stake decrease', () => {
      // The decrease will offset the increase from the previous test
      let newStake: BigNumber
      let totalShares: BigNumber
      let oldPrinciple: BigNumber

      let feesBefore: BigNumber = ethers.constants.Zero
      let tx: ContractTransaction

      before(async function () {
        this.timeout(testTimeout)
        feesBefore = await Tenderizer.pendingFees()
        oldPrinciple = await Tenderizer.currentPrincipal()

        // Impersonate guardian and slash NODE
        await hre.network.provider.request({
          method: 'hardhat_impersonateAccount',
          params: [guardianAddr]
        })
        const guardianSinger = await ethers.provider.getSigner(guardianAddr)
        const gov = new ethers.Contract(govAddr, govAbi, ethers.provider)
        const abi = new ethers.utils.AbiCoder()
        await gov.connect(guardianSinger).guardianExecuteTransaction(
          hre.web3.utils.fromAscii('DelegateManager\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0'),
          ethers.BigNumber.from(0),
          'slash(uint256,address)',
          abi.encode(['uint256', 'address'], [ethers.utils.parseEther('100'), NODE]),
          { from: guardianAddr }
        )

        newStake = await AudiusStaking.getTotalDelegatorStake(Tenderizer.address)
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
      before(async () => {
        const txData = ethers.utils.arrayify(Tenderizer.interface.encodeFunctionData('unstake',
          [Controller.address, ethers.utils.parseEther('0')]))
        tx = await Controller.execute(Tenderizer.address, 0, txData)
      })

      it('requestUndelegateStake() suceeds - event emitted', async () => {
        const rx = await tx.wait()
        if (rx.events === undefined) throw new Error('No events')
        expect(rx.events[0].topics[0]).to.eq(undelegateStakeRequestedTopic)
      })

      it('should emit Unstake event from Tenderizer', async () => {
        expect(tx).to.emit(Tenderizer, 'Unstake').withArgs(Controller.address, NODE, withdrawAmount, govUnboundLockID)
      })
    })
  })

  describe('withdraw', () => {
    describe('gov withdrawal', async () => {
      it('reverts if undelegateStake() reverts - lockup pending', async () => {
        const txData = ethers.utils.arrayify(Tenderizer.interface.encodeFunctionData('withdraw',
          [Controller.address, govUnboundLockID]))
        await expect(Controller.execute(Tenderizer.address, 0, txData)).to.be.reverted
      })

      it('undelegateStake() succeeds', async () => {
        // Mine blocks to complete lockup
        for (let j = 0; j < 46523; j++) {
          await hre.ethers.provider.send('evm_mine', [])
        }
        const txData = ethers.utils.arrayify(Tenderizer.interface.encodeFunctionData('withdraw',
          [Controller.address, govUnboundLockID]))
        tx = await Controller.execute(Tenderizer.address, 0, txData)
      }).timeout(testTimeout * 10)

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
})