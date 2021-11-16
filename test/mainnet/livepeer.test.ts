import hre, { ethers } from 'hardhat'

import {
  Controller, ElasticSupplyPool, TenderToken, ILivepeer, BPool, Livepeer, ERC20, TenderFarm
} from '../../typechain'

import bondingManagerAbi from './abis/livepeer/BondingManager.json'
import adjustableRoundsManagerAbi from './abis/livepeer/AdjustableRoundsManager.json'
import uniswapV3PairAbi from './abis/livepeer/UniswapV3Pair.json'

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
  let TenderFarm: TenderFarm

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
  const ticketBrokerAddr = '0x5b1cE829384EeBFa30286F12d1E7A695ca45F5D2'
  let bondingManager: Contract
  let roundsManager: Contract

  const LPTDeployer = '0x505f8c2ee81f1c6fa0d88e918ef0491222e05818'
  let multisigSigner: Signer
  const uniswapEthLptPairAddr = '0x2519042aa735edb4688a8376d69d4bb69431206c'

  const testTimeout = 1200000

  before('deploy Livepeer Tenderizer', async function () {
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

    process.env.NAME = 'Livepeer'
    process.env.SYMBOL = 'LPT'
    process.env.CONTRACT = bondingManagerAddr
    process.env.TOKEN = '0x58b6A8A3302369DAEc383334672404Ee733aB239'
    process.env.VALIDATOR = NODE
    process.env.BFACTORY = '0x9424B1412450D0f8Fc2255FAf6046b98213B76Bd'
    process.env.B_SAFEMATH = '0xCfE28868F6E0A24b7333D22D8943279e76aC2cdc'
    process.env.B_RIGHTS_MANAGER = '0xCfE28868F6E0A24b7333D22D8943279e76aC2cdc'
    process.env.B_SMART_POOL_MANAGER = '0xA3F9145CB0B50D907930840BB2dcfF4146df8Ab4'
    process.env.STEAK_AMOUNT = STEAK_AMOUNT

    const uniswapRouter = '0xE592427A0AEce92De3Edee1F18E0157C05861564'

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
    TenderFarm = (await ethers.getContractAt('TenderFarm', Livepeer.TenderFarm.address)) as TenderFarm
    await Controller.batchExecute(
      [Tenderizer.address, Tenderizer.address, Tenderizer.address],
      [0, 0, 0],
      [Tenderizer.interface.encodeFunctionData('setProtocolFee', [protocolFeesPercent]),
        Tenderizer.interface.encodeFunctionData('setLiquidityFee', [liquidityFeesPercent]),
        Tenderizer.interface.encodeFunctionData('setUniswapRouter', [uniswapRouter])]
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
    let stakeBefore:BigNumber
    before(async function () {
      this.timeout(testTimeout)
      stakeBefore = await LivepeerStaking.pendingStake(Tenderizer.address, MAX_ROUND)
      tx = await Controller.gulp()
    })

    it('bond succeeds', async () => {
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
      let totalShares: BigNumber = ethers.utils.parseEther('1')

      before(async function () {
        this.timeout(testTimeout * 10)
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

        // Generate some ETH fees
        await hre.network.provider.request({
          method: 'hardhat_impersonateAccount',
          params: [ticketBrokerAddr]
        })
        const ticketBrokerSigner = await ethers.provider.getSigner(ticketBrokerAddr)
        await hre.network.provider.send('hardhat_setBalance', [
          ticketBrokerAddr,
          `0x${ethers.utils.parseEther('100').toString()}`
        ])
        await bondingManager.connect(ticketBrokerSigner).updateTranscoderWithFees(NODE, ethers.utils.parseEther('100'), currentRound)

        // Get penging ETH FEES
        const pendingEthFees = await bondingManager.pendingFees(Tenderizer.address, MAX_ROUND)

        // Get current price of ETH -> LPT
        const uniPair = new ethers.Contract(uniswapEthLptPairAddr, uniswapV3PairAbi, ethers.provider)
        const sqrtPrice = (await uniPair.slot0()).sqrtPriceX96
        const swappedLPTRewards = BigNumber.from(2).pow(192).mul(pendingEthFees).div(sqrtPrice.pow(2))

        increase = stakeAfter.sub(stakeBefore)
        const liquidityFees = percOf2(increase.add(swappedLPTRewards), liquidityFeesPercent)
        const protocolFees = percOf2(increase.add(swappedLPTRewards), protocolFeesPercent)
        newStake = deposit.add(initialStake).add(increase)
        newStakeMinusFees = newStake.add(swappedLPTRewards).sub(liquidityFees.add(protocolFees))
        tx = await Controller.rebase()
      })

      it('updates currentPrincipal', async () => {
        // Account for any slippage in the swap
        expect((await Tenderizer.currentPrincipal()).sub(newStakeMinusFees).abs())
          .to.lt(ethers.utils.parseEther(acceptableDelta.toString()))
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

      it('stakes all rewards claimed - drains tenderizer', async () => {
        expect(await LivepeerToken.balanceOf(Tenderizer.address)).to.eq(0)
      })

      it('should emit RewardsClaimed event from Tenderizer', async () => {
        // Not testing the values as there is some variable slippage depending on the block
        // TODO: Test with some acceptable delta
        expect(tx).to.emit(Tenderizer, 'RewardsClaimed')
      })
    })
  })

  describe('collect fees', () => {
    let fees: BigNumber
    let ownerBalBefore: BigNumber
    let otherAcc: SignerWithAddress
    let otherAccBalBefore: BigNumber

    before(async () => {
      otherAcc = signers[3]
      fees = await Tenderizer.pendingFees()
      ownerBalBefore = await TenderToken.balanceOf(deployer)
      tx = await Controller.collectFees()
      otherAccBalBefore = await TenderToken.balanceOf(otherAcc.address)
      await tx.wait()
    })

    it('should reset pendingFees', async () => {
      expect(await Tenderizer.pendingFees()).to.eq(ethers.constants.Zero)
    })

    it('should increase tenderToken balance of owner', async () => {
      expect((await TenderToken.balanceOf(deployer)).sub(ownerBalBefore.add(fees)).abs()).to.lte(acceptableDelta)
    })

    it('should retain the balance for any other account', async () => {
      expect((await TenderToken.balanceOf(otherAcc.address))).to.eq(otherAccBalBefore)
    })

    it('should emit ProtocolFeeCollected event from Tenderizer', async () => {
      expect(tx).to.emit(Tenderizer, 'ProtocolFeeCollected').withArgs(fees)
    })
  })

  describe('collect liquidity fees', () => {
    let fees: BigNumber
    let farmBalanceBefore: BigNumber
    let otherAcc: SignerWithAddress
    let otherAccBalBefore: BigNumber

    before(async () => {
      otherAcc = signers[3]
      fees = await Tenderizer.pendingLiquidityFees()
      farmBalanceBefore = await TenderToken.balanceOf(TenderFarm.address)
      tx = await Controller.collectLiquidityFees()
      otherAccBalBefore = await TenderToken.balanceOf(otherAcc.address)
      await tx.wait()
    })

    it('should reset pendingFees', async () => {
      expect(await Tenderizer.pendingLiquidityFees()).to.eq(ethers.constants.Zero)
    })

    it('should increase tenderToken balance of tenderFarm', async () => {
      expect((await TenderToken.balanceOf(TenderFarm.address)).sub(farmBalanceBefore.add(fees)).abs()).to.lte(acceptableDelta)
    })

    it('should retain the balance for any other account', async () => {
      expect((await TenderToken.balanceOf(otherAcc.address))).to.eq(otherAccBalBefore)
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

    it('wihtdraw() succeeeds - unstake lock is deleted', async () => {
      // Mine blocks for 7 rounds (withdraw period)
      const roundLength = await roundsManager.roundLength()
      for (let j = 0; j < roundLength * 7; j++) {
        await hre.ethers.provider.send('evm_mine', [])
      }
      await roundsManager.connect(multisigSigner).initializeRound()
      lptBalBefore = await LivepeerToken.balanceOf(deployer)
      tx = await Controller.withdraw(lockID)
      const lock = await Tenderizer.unstakeLocks(lockID)
      expect(lock.account).to.eq(ethers.constants.AddressZero)
      expect(lock.amount).to.eq(0)
    }).timeout(testTimeout) // Set high timeout for test, to mine 7 rounds

    it('should delete unstakeLock on Livepeer', async () => {
      const lock = await bondingManager.getDelegatorUnbondingLock(Tenderizer.address, lockID)
      expect(lock.amount).to.eq(0)
    })

    it('increases LPT balance', async () => {
      expect(await LivepeerToken.balanceOf(deployer)).to.eq(lptBalBefore.add(withdrawAmount))
    })

    it('should emit Withdraw event from Tenderizer', async () => {
      expect(tx).to.emit(Tenderizer, 'Withdraw').withArgs(deployer, withdrawAmount, lockID)
    })
  })
})
