import hre, { ethers } from 'hardhat'

import {
  Controller, ElasticSupplyPool, TenderToken, ILivepeer, BPool, EIP173Proxy, Livepeer, ERC20
} from '../../typechain'

import bondingManagerAbi from './abis/livepeer/BondingManager.json'
import adjustableRoundsManagerAbi from './abis/livepeer/AdjustableRoundsManager.json'

import chai from 'chai'
import {
  solidity
} from 'ethereum-waffle'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { Deployment } from 'hardhat-deploy/dist/types'
import { BigNumber } from '@ethersproject/bignumber'
import { Contract, ContractTransaction } from '@ethersproject/contracts'

import { sharesToTokens, percOf2 } from '../util/helpers'
import { Signer } from '@ethersproject/abstract-signer'

chai.use(solidity)
const {
  expect
} = chai

describe('Livepeer Mainnet Fork Test', () => {
  let LivepeerStaking: ILivepeer
  let LivepeerToken: ERC20
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
  const lockID = 0
  const protocolFeesPercent = ethers.utils.parseEther('0.025')
  const liquidityFeesPercent = ethers.utils.parseEther('0.025')

  const acceptableDelta = 2

  const MAX_ROUND = BigNumber.from(2).pow(256).sub(1)

  before('get signers', async () => {
    const namedAccs = await hre.getNamedAccounts()
    signers = await ethers.getSigners()

    deployer = namedAccs.deployer
  })

  const STEAK_AMOUNT = '100000'
  const NODE = '0x9C10672CEE058Fd658103d90872fE431bb6C0AFa'
  const bondingManagerAddr = '0x511bc4556d823ae99630ae8de28b9b80df90ea2e'
  const roundsManagerAddr = '0x3984fc4ceeef1739135476f625d36d6c35c40dc3'
  let bondingManager: Contract
  let roundsManager: Contract

  const LPTDeployer = '0x505f8c2ee81f1c6fa0d88e918ef0491222e05818'
  let multisigSigner: Signer

  const testTimeout = 120000

  before('deploy Livepeer Tenderizer', async function () {
    this.timeout(testTimeout)
    // Fork from mainnet
    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [{
        forking: {
          blockNumber: 12000000,
          jsonRpcUrl: process.env.ALCHEMY_URL || 'https://eth-mainnet.alchemyapi.io/v2/s93KFT7TnttkCPdNS2Fg_HAoCpP6dEda'
        }
      }]
    })

    process.env.NAME = 'Livepeer'
    process.env.SYMBOL = 'LPT'
    process.env.CONTRACT = bondingManagerAddr
    process.env.TOKEN = '0x58b6a8a3302369daec383334672404ee733ab239'
    process.env.VALIDATOR = NODE
    process.env.BFACTORY = '0x9424B1412450D0f8Fc2255FAf6046b98213B76Bd'
    process.env.B_SAFEMATH = '0xCfE28868F6E0A24b7333D22D8943279e76aC2cdc'
    process.env.B_RIGHTS_MANAGER = '0xCfE28868F6E0A24b7333D22D8943279e76aC2cdc'
    process.env.B_SMART_POOL_MANAGER = '0xA3F9145CB0B50D907930840BB2dcfF4146df8Ab4'
    process.env.STEAK_AMOUNT = STEAK_AMOUNT

    const oneInchAddr = '0x111111111117dC0aa78b770fA6A738034120C302'

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [LPTDeployer]
    })
    multisigSigner = await ethers.provider.getSigner(LPTDeployer)

    // Transfer some LPT
    LivepeerToken = (await ethers.getContractAt('ERC20', process.env.TOKEN)) as ERC20
    await LivepeerToken.connect(multisigSigner).transfer(deployer, ethers.utils.parseEther(process.env.STEAK_AMOUNT).mul(2))

    LivepeerStaking = (await ethers.getContractAt('ILivepeer', process.env.CONTRACT)) as ILivepeer

    Livepeer = await hre.deployments.fixture(['Livepeer'], {
      keepExistingDeployments: false
    })
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
        Tenderizer.interface.encodeFunctionData('setOneInchContract', [oneInchAddr])]
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
      const stakeBefore = await LivepeerStaking.pendingStake(Tenderizer.address, MAX_ROUND)
      tx = await Controller.gulp()
      expect(await LivepeerStaking.pendingStake(Tenderizer.address, MAX_ROUND)).to.eq(stakeBefore.add(deposit))
    })

    it('emits Stake event from tenderizer', async () => {
      expect(tx).to.emit(Tenderizer, 'Stake').withArgs(NODE, deposit)
    })
  })

  describe('rebase', () => {
    describe('stake increased', () => {
      let increase: BigNumber
      let newStakeMinusFees: BigNumber
      let newStake: BigNumber
      const swappedLPTRewards = ethers.BigNumber.from('0') // TODO: Add test with ETH->LPT Swap
      let totalShares: BigNumber = ethers.utils.parseEther('1')
      const percDiv = ethers.utils.parseEther('1')

      before(async () => {
        bondingManager = new ethers.Contract(bondingManagerAddr, bondingManagerAbi, ethers.provider)
        roundsManager = new ethers.Contract(roundsManagerAddr, adjustableRoundsManagerAbi, ethers.provider)

        let currentRound = await roundsManager.currentRound()
        const stakeBefore = await bondingManager.pendingStake(Tenderizer.address, currentRound)

        await hre.network.provider.request({
          method: 'hardhat_impersonateAccount',
          params: [NODE]
        })
        const transcoderSigner = await ethers.provider.getSigner(NODE)

        // Mine blocks for one round
        const roundLength = await roundsManager.roundLength()
        for (let j = 0; j < roundLength; j++) {
          await hre.ethers.provider.send('evm_mine', [])
        }

        // Initialize round and reward
        const initialized = await roundsManager.connect(multisigSigner).currentRoundInitialized()
        if (!initialized) {
          await roundsManager.connect(multisigSigner).initializeRound()
        }
        await bondingManager.connect(transcoderSigner).reward()

        currentRound = await roundsManager.currentRound()
        const stakeAfter = (await bondingManager.pendingStake(Tenderizer.address, currentRound))
        increase = stakeAfter.sub(stakeBefore)
        const liquidityFees = percOf2(increase.add(swappedLPTRewards), liquidityFeesPercent)
        const protocolFees = percOf2(increase.add(swappedLPTRewards), protocolFeesPercent)
        newStake = deposit.add(initialStake).add(increase)
        newStakeMinusFees = newStake.add(swappedLPTRewards).sub(liquidityFees.add(protocolFees))
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

      it('should emit RewardsClaimed event from Tenderizer', async () => {
        expect(tx).to.emit(Tenderizer, 'RewardsClaimed')
          .withArgs(increase.add(swappedLPTRewards), newStakeMinusFees, deposit.add(initialStake))
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
    let delBefore: BigNumber
    before(async () => {
      withdrawAmount = await TenderToken.balanceOf(deployer)
      delBefore = await LivepeerStaking.pendingStake(Tenderizer.address, MAX_ROUND)
      tx = await Controller.connect(signers[0]).unlock(withdrawAmount)
    })

    it('unbond() succeeds', async () => {
      expect(delBefore.sub(await LivepeerStaking.pendingStake(Tenderizer.address, MAX_ROUND))).to.eq(withdrawAmount)
    })

    it('reduces TenderToken Balance', async () => {
      // lte to account for any roundoff error in tokenToShare calcualtion during burn
      expect(await TenderToken.balanceOf(deployer)).to.lte(acceptableDelta)
    })

    it('should create unstakeLock on Tenderizer', async () => {
      const lock = await Tenderizer.unstakeLocks(lockID)
      expect(lock.account).to.eq(deployer)
      expect(lock.amount).to.eq(withdrawAmount)
    })

    it('should create unstakeLock on Livepeer', async () => {
      const lock = await bondingManager.getDelegatorUnbondingLock(Tenderizer.address, lockID)
      expect(lock.amount).to.eq(withdrawAmount)
    })

    it('should emit Unstake event from Tenderizer', async () => {
      expect(tx).to.emit(Tenderizer, 'Unstake').withArgs(deployer, NODE, withdrawAmount, lockID)
    })
  })

  describe('withdraw', async () => {
    let lptBalBefore : BigNumber

    it('reverts if wihtdraw() reverts - unbond period not complete', async () => {
      await expect(Controller.withdraw(lockID)).to.be.reverted
    })

    // TODO: Change to before, but can't increase max timeout on before()
    it('wihtdraw() succeeeds - unstake lock is deleted', async () => {
      // Mine blocks for 7 rounds (withdraw period)
      const roundLength = await roundsManager.roundLength()
      for (let i = 0; i < 7; i++) {
        for (let j = 0; j < roundLength; j++) {
          await hre.ethers.provider.send('evm_mine', [])
        }
        await roundsManager.connect(multisigSigner).initializeRound()
      }
      lptBalBefore = await LivepeerToken.balanceOf(deployer)
      tx = await Controller.withdraw(lockID)
    }).timeout(testTimeout) // Set high timeout for test, to mine 7 rounds

    it('should delete unstakeLock on Livepeer', async () => {
      const lock = await bondingManager.getDelegatorUnbondingLock(Tenderizer.address, lockID)
      expect(lock.amount).to.eq(0)
    })

    it('increases LPT balance', async () => {
      expect(await LivepeerToken.balanceOf(deployer)).to.eq(lptBalBefore.add(withdrawAmount))
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
})
