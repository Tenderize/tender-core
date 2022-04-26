import hre, { ethers } from 'hardhat'

import {
  TenderToken, IMatic, TenderFarm, EIP173Proxy, Matic, ERC20, TenderSwap, Audius, LiquidityPoolToken
} from '../../typechain'
import { getCurrentBlockTimestamp } from '../util/evm'

import rootChainAbi from './abis/matic/RootChain.json'
import StakeManagerABI from './abis/matic/StakeManager.json'
import GovernanceABI from './abis/matic/Governance.json'
import chai from 'chai'
import {
  solidity
} from 'ethereum-waffle'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { Deployment } from 'hardhat-deploy/dist/types'
import { BigNumber } from '@ethersproject/bignumber'
import { Contract, ContractTransaction } from '@ethersproject/contracts'

import { Signer } from '@ethersproject/abstract-signer'
import { percOf2, sharesToTokens } from '../util/helpers'
import { buildCheckpointData, voteForValidator, submitCheckpoint } from './util/matic_mainnet_helpers'
import { sign } from 'crypto'
const MerkleTree = require('../util/merkle-tree')
const ethUtils = require('ethereumjs-util')

const governanceOwner = '0xcaf0aa768a3ae1297df20072419db8bb8b5c8cef'
const governance = '0x6e7a5820baD6cebA8Ef5ea69c0C92EbbDAc9CE48'
const maticStakeManagerAddr = '0x5e3Ef299fDDf15eAa0432E6e66473ace8c13D908'
const validatorSigner = '0x1efecb61a2f80aa34d3b9218b564a64d05946290'

chai.use(solidity)
const {
  expect
} = chai

describe('Matic Mainnet Fork Test', () => {
  let MaticStaking: IMatic
  let MaticToken: ERC20
  let Tenderizer: Matic
  let TenderToken: TenderToken
  let TenderSwap: TenderSwap
  let LpToken: LiquidityPoolToken
  let TenderFarm: TenderFarm

  let Matic: {[name: string]: Deployment}

  let MaticStakeManager

  let signers: SignerWithAddress[]
  let deployer: string

  let withdrawAmount: BigNumber

  let tx: ContractTransaction
  const lockID = 0
  const protocolFeesPercent = ethers.utils.parseEther('0.025')
  const liquidityFeesPercent = ethers.utils.parseEther('0.025')

  const acceptableDelta = 2

  const EXCHAGE_RATE_PERCEISON = BigNumber.from(10).pow(29)

  before('get signers', async () => {
    const namedAccs = await hre.getNamedAccounts()
    signers = await ethers.getSigners()

    deployer = namedAccs.deployer
  })

  const STEAK_AMOUNT = '10000000'
  const stakeManagerAddr = '0x5e3ef299fddf15eaa0432e6e66473ace8c13d908'

  const MAX_SIGNERS = 128

  const maticHolder = '0x2f7e209e0F5F645c7612D7610193Fe268F118b28'
  let maticHolderSinger: Signer

  const testTimeout = 120000

  before('deploy Matic Tenderizer', async function () {
    this.timeout(testTimeout)
    // Fork from mainnet
    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [{
        forking: {
          // blockNumber: 13222135,
          jsonRpcUrl: process.env.ALCHEMY_URL || 'https://eth-mainnet.alchemyapi.io/v2/s93KFT7TnttkCPdNS2Fg_HAoCpP6dEda'
        }
      }]
    })

    process.env.NAME = 'Matic'
    process.env.SYMBOL = 'MATIC'
    process.env.CONTRACT = stakeManagerAddr
    process.env.TOKEN = '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0'
    process.env.STEAK_AMOUNT = STEAK_AMOUNT

    // Get validator data
    const MaticStakeManager = new ethers.Contract(stakeManagerAddr, StakeManagerABI, ethers.provider)
    const validatorID = await MaticStakeManager.signerToValidator(validatorSigner)
    const validatorShare = await MaticStakeManager.getValidatorContract(validatorID)
    process.env.VALIDATOR = validatorShare

    console.log(process.env.VALIDATOR)

    // Transfer some ETH to matic Holder and governance
    const ETHHolder = '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8'

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ETHHolder]
    })

    console.log('sending ETH To accounts')
    await hre.web3.eth.sendTransaction({ from: ETHHolder, to: governanceOwner, value: ethers.utils.parseEther('1').toString() })
    await hre.web3.eth.sendTransaction({ from: ETHHolder, to: maticHolder, value: ethers.utils.parseEther('10').toString() })
    console.log('eth sent')
    await hre.network.provider.request({
      method: 'hardhat_stopImpersonatingAccount',
      params: [ETHHolder]
    })

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [maticHolder]
    })
    maticHolderSinger = await ethers.getSigner(maticHolder)
    // Transfer some MATIC
    MaticToken = (await ethers.getContractAt('ERC20', process.env.TOKEN)) as ERC20
    await MaticToken.connect(maticHolderSinger).transfer(deployer, ethers.utils.parseEther(process.env.STEAK_AMOUNT).mul(2))
    await hre.network.provider.request({
      method: 'hardhat_stopImpersonatingAccount',
      params: [maticHolder]
    })

    MaticStaking = (await ethers.getContractAt('IMatic', process.env.VALIDATOR || '')) as IMatic

    Matic = await hre.deployments.fixture(['Matic'], {
      keepExistingDeployments: false
    })

    Tenderizer = (await ethers.getContractAt('Matic', Matic.Matic.address)) as Matic
    TenderToken = (await ethers.getContractAt('TenderToken', await Tenderizer.tenderToken())) as TenderToken
    TenderSwap = (await ethers.getContractAt('TenderSwap', await Tenderizer.tenderSwap())) as TenderSwap
    TenderFarm = (await ethers.getContractAt('TenderFarm', await Tenderizer.tenderFarm())) as TenderFarm
    LpToken = (await ethers.getContractAt('LiquidityPoolToken', await TenderSwap.lpToken())) as LiquidityPoolToken
    await Tenderizer.setProtocolFee(protocolFeesPercent)
    await Tenderizer.setLiquidityFee(liquidityFeesPercent)

    // Deposit initial stake
    await MaticToken.approve(Tenderizer.address, initialStake)
    await Tenderizer.deposit(initialStake, { gasLimit: 500000 })
    // Add initial liquidity
    await MaticToken.approve(TenderSwap.address, initialStake)
    await TenderToken.approve(TenderSwap.address, initialStake)
    const lpTokensOut = await TenderSwap.calculateTokenAmount([initialStake, initialStake], true)
    await TenderSwap.addLiquidity([initialStake, initialStake], lpTokensOut, (await getCurrentBlockTimestamp()) + 1000)
    await LpToken.approve(TenderFarm.address, lpTokensOut)
    await TenderFarm.farm(lpTokensOut)
  })

  const initialStake = ethers.utils.parseEther(STEAK_AMOUNT).div('2')

  const deposit = ethers.utils.parseEther('100')

  describe('deposit', () => {
    it('reverts because transfer amount exceeds allowance', async () => {
      await expect(Tenderizer.deposit(deposit)).to.be.reverted
    })

    describe('deposits funds succesfully', async () => {
      before(async () => {
        await MaticToken.approve(Tenderizer.address, deposit)
        tx = await Tenderizer.deposit(deposit)
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
    let stakeBefore: BigNumber
    before(async () => {
      // Exchange rate would be 1 at this point, so can simply comapre the shares
      stakeBefore = await MaticStaking.balanceOf(Tenderizer.address)
      tx = await Tenderizer.claimRewards()
    })

    it('bond succeeds', async () => {
      expect(await MaticStaking.balanceOf(Tenderizer.address)).to.eq(initialStake.add(deposit))
    })

    it('emits Stake event from tenderizer', async () => {
      expect(tx).to.emit(Tenderizer, 'Stake').withArgs(process.env.VALIDATOR, initialStake.add(deposit))
    })
  })

  describe('rebase', () => {
    describe('stake increased', () => {
      let increase: BigNumber
      let newStakeMinusFees: BigNumber
      let newStake: BigNumber
      const swappedLPTRewards = ethers.BigNumber.from('0') // TODO: Add test with ETH->LPT Swap
      const totalShares: BigNumber = ethers.utils.parseEther('1')
      const percDiv = ethers.utils.parseEther('1')

      before(async function () {
        this.timeout(testTimeout * 2)

        const sharesBefore = await MaticStaking.balanceOf(Tenderizer.address)
        let exRate = await MaticStaking.exchangeRate()
        const stakeBefore = sharesBefore.mul(exRate).div(EXCHAGE_RATE_PERCEISON)

        const signatures: any[] = []
        const checkPointData = await buildCheckpointData(hre, validatorSigner)

        // Vote on checkpoint with 2/3rd stake majority
        for (let i = 1; i < MAX_SIGNERS; i++) {
          signatures.push(await voteForValidator(hre, i, checkPointData, true))
        }

        console.log(signatures)

        await submitCheckpoint(hre, validatorSigner, checkPointData, signatures)

        console.log('checkpoint submitted')
        const sharesAfter = await MaticStaking.balanceOf(Tenderizer.address)
        exRate = await MaticStaking.exchangeRate()
        const stakeAfter = sharesAfter.mul(exRate).div(EXCHAGE_RATE_PERCEISON)
        increase = stakeAfter.sub(stakeBefore)
        console.log(increase)
        const liquidityFees = percOf2(increase.add(swappedLPTRewards), liquidityFeesPercent)
        const protocolFees = percOf2(increase.add(swappedLPTRewards), protocolFeesPercent)
        newStake = deposit.add(initialStake).add(increase)
        newStakeMinusFees = newStake.add(swappedLPTRewards).sub(liquidityFees.add(protocolFees))
        tx = await Tenderizer.claimRewards()
      })

      it('updates currentPrincipal', async () => {
        expect(await Tenderizer.currentPrincipal()).to.eq(newStakeMinusFees)
      })

      // it('increases tendertoken balances when rewards are added', async () => {
      //   // account 0
      //   const shares = await TenderToken.sharesOf(deployer)
      //   totalShares = await TenderToken.getTotalShares()
      //   expect(await TenderToken.balanceOf(deployer)).to.eq(sharesToTokens(shares, totalShares, await TenderToken.totalSupply()))
      // })

      // it('increases the tenderToken balance of the AMM', async () => {
      //   const shares = await TenderToken.sharesOf(BPool.address)
      //   expect(await TenderToken.balanceOf(BPool.address)).to.eq(sharesToTokens(shares, totalShares, await TenderToken.totalSupply()))
      // })

      // it('changes the weights of the AMM', async () => {
      //   const tBal = await TenderToken.balanceOf(BPool.address)
      //   const bal = await MaticToken.balanceOf(BPool.address)

      //   const acceptableDelta = ethers.BigNumber.from('100')

      //   const expected = tBal.mul(percDiv).div(tBal.add(bal))
      //   const actual = await BPool.getNormalizedWeight(TenderToken.address)
      //   expect(actual.sub(expected).abs()).to.be.lte(acceptableDelta)
      // })

    // it('should emit RewardsClaimed event from Tenderizer', async () => {
    //   expect(tx).to.emit(Tenderizer, 'RewardsClaimed')
    //     .withArgs(increase.add(swappedLPTRewards), newStakeMinusFees, deposit.add(initialStake))
    // })
    })
  })

  //   describe('collect fees', () => {
  //     let fees: BigNumber
  //     let ownerBalBefore: BigNumber

  //     before(async () => {
  //       fees = await Tenderizer.pendingFees()
  //       ownerBalBefore = await TenderToken.balanceOf(deployer)
  //       tx = await Controller.collectFees()
  //     })

  //     it('should reset pendingFees', async () => {
  //       expect(await Tenderizer.pendingFees()).to.eq(ethers.constants.Zero)
  //     })

  //     it('should increase tenderToken balance of owner', async () => {
  //       expect(await TenderToken.balanceOf(deployer)).to.eq(ownerBalBefore.add(fees))
  //     })

  //     it('should emit ProtocolFeeCollected event from Tenderizer', async () => {
  //       expect(tx).to.emit(Tenderizer, 'ProtocolFeeCollected').withArgs(fees)
  //     })
  //   })

  //   describe('collect liquidity fees', () => {
  //     let fees: BigNumber
  //     let farmBalanceBefore: BigNumber
  //     let mockTenderFarm : SignerWithAddress

  //     before(async () => {
  //       mockTenderFarm = signers[3]
  //       fees = await Tenderizer.pendingLiquidityFees()
  //       farmBalanceBefore = await TenderToken.balanceOf(mockTenderFarm.address)
  //       tx = await Controller.collectLiquidityFees()
  //     })

  //     it('should reset pendingFees', async () => {
  //       expect(await Tenderizer.pendingLiquidityFees()).to.eq(ethers.constants.Zero)
  //     })

  //     it('should increase tenderToken balance of tenderFarm', async () => {
  //       expect(await TenderToken.balanceOf(mockTenderFarm.address)).to.eq(farmBalanceBefore.add(fees))
  //     })

  //     it('should emit ProtocolFeeCollected event from Tenderizer', async () => {
  //       expect(tx).to.emit(Tenderizer, 'LiquidityFeeCollected').withArgs(fees)
  //     })
  //   })

  //   describe('swap against ESP', () => {
  //     it('swaps tenderToken for Token', async () => {
  //       const amount = deposit.div(2)
  //       const lptBalBefore = await MaticToken.balanceOf(deployer)

  //       const tenderBal = await BPool.getBalance(TenderToken.address)
  //       const lptBal = await BPool.getBalance(MaticToken.address)
  //       const tenderWeight = await BPool.getDenormalizedWeight(TenderToken.address)
  //       const lptWeight = await BPool.getDenormalizedWeight(MaticToken.address)
  //       const swapFee = await BPool.getSwapFee()
  //       const expOut = await BPool.calcOutGivenIn(
  //         tenderBal,
  //         tenderWeight,
  //         lptBal,
  //         lptWeight,
  //         amount,
  //         swapFee
  //       )

  //       await TenderToken.approve(BPool.address, amount)
  //       await BPool.swapExactAmountIn(
  //         TenderToken.address,
  //         amount,
  //         MaticToken.address,
  //         ethers.constants.One, // TODO: set proper value
  //         ethers.utils.parseEther('10') // TODO: set proper value
  //       )

  //       const lptBalAfter = await MaticToken.balanceOf(deployer)
  //       expect(lptBalAfter.sub(lptBalBefore)).to.eq(expOut)
  //     })
  //   })

  //   describe('unlock', async () => {
  //     let delBefore: BigNumber
  //     before(async () => {
  //       withdrawAmount = await TenderToken.balanceOf(deployer)
  //       delBefore = await LivepeerStaking.pendingStake(Tenderizer.address, MAX_ROUND)
  //       tx = await Controller.connect(signers[0]).unlock(withdrawAmount)
  //     })

  //     it('unbond() succeeds', async () => {
  //       expect(delBefore.sub(await LivepeerStaking.pendingStake(Tenderizer.address, MAX_ROUND))).to.eq(withdrawAmount)
  //     })

  //     it('reduces TenderToken Balance', async () => {
  //       // lte to account for any roundoff error in tokenToShare calcualtion during burn
  //       expect(await TenderToken.balanceOf(deployer)).to.lte(acceptableDelta)
  //     })

  //     it('should create unstakeLock on Tenderizer', async () => {
  //       const lock = await Tenderizer.unstakeLocks(lockID)
  //       expect(lock.account).to.eq(deployer)
  //       expect(lock.amount).to.eq(withdrawAmount)
  //     })

  //     it('should create unstakeLock on Livepeer', async () => {
  //       const lock = await bondingManager.getDelegatorUnbondingLock(Tenderizer.address, lockID)
  //       expect(lock.amount).to.eq(withdrawAmount)
  //     })

  //     it('should emit Unstake event from Tenderizer', async () => {
  //       expect(tx).to.emit(Tenderizer, 'Unstake').withArgs(deployer, NODE, withdrawAmount, lockID)
  //     })
  //   })

  //   describe('withdraw', async () => {
  //     let lptBalBefore : BigNumber

  //     it('reverts if wihtdraw() reverts - unbond period not complete', async () => {
  //       await expect(Controller.withdraw(lockID)).to.be.reverted
  //     })

  //     // TODO: Change to before, but can't increase max timeout on before()
  //     it('wihtdraw() succeeeds - unstake lock is deleted', async () => {
  //       // Mine blocks for 7 rounds (withdraw period)
  //       const roundLength = await roundsManager.roundLength()
  //       for (let i = 0; i < 7; i++) {
  //         for (let j = 0; j < roundLength; j++) {
  //           await hre.ethers.provider.send('evm_mine', [])
  //         }
  //         await roundsManager.connect(maticHolderSinger).initializeRound()
  //       }
  //       lptBalBefore = await MaticToken.balanceOf(deployer)
  //       tx = await Controller.withdraw(lockID)
  //     }).timeout(testTimeout) // Set high timeout for test, to mine 7 rounds

  //     it('should delete unstakeLock on Livepeer', async () => {
  //       const lock = await bondingManager.getDelegatorUnbondingLock(Tenderizer.address, lockID)
  //       expect(lock.amount).to.eq(0)
  //     })

  //     it('increases LPT balance', async () => {
  //       expect(await MaticToken.balanceOf(deployer)).to.eq(lptBalBefore.add(withdrawAmount))
  //     })

  //     it('should delete unstakeLock', async () => {
  //       const lock = await Tenderizer.unstakeLocks(lockID)
  //       expect(lock.account).to.eq(ethers.constants.AddressZero)
  //       expect(lock.amount).to.eq(0)
  //     })

  //     it('should emit Withdraw event from Tenderizer', async () => {
  //       expect(tx).to.emit(Tenderizer, 'Withdraw').withArgs(deployer, withdrawAmount, lockID)
  //     })
  //   })

  //   describe('upgrade', () => {
  //     let proxy: EIP173Proxy
  //     let newTenderizer:any
  //     let beforeBalance: BigNumber
  //     before(async () => {
  //       proxy = (await ethers.getContractAt('EIP173Proxy', Livepeer.Livepeer_Proxy.address)) as EIP173Proxy
  //       beforeBalance = await Tenderizer.currentPrincipal()
  //       const newFac = await ethers.getContractFactory('Livepeer', signers[0])
  //       newTenderizer = await newFac.deploy()
  //     })

  //     it('upgrade tenderizer', async () => {
  //       await hre.network.provider.request({
  //         method: 'hardhat_impersonateAccount',
  //         params: [Controller.address]
  //       }
  //       )

  //       const signer = await ethers.provider.getSigner(Controller.address)

  //       expect(await proxy.connect(signer).upgradeTo(newTenderizer.address, { gasLimit: 400000, gasPrice: 0 })).to.emit(
  //         proxy,
  //         'ProxyImplementationUpdated'
  //       ).withArgs(Livepeer.Livepeer_Implementation.address, newTenderizer.address)

  //       await hre.network.provider.request({
  //         method: 'hardhat_stopImpersonatingAccount',
  //         params: [Controller.address]
  //       }
  //       )
  //     })

//     it('current principal still matches', async () => {
//       const newPrincipal = await Tenderizer.currentPrincipal()
//       expect(newPrincipal).to.equal(beforeBalance)
//     })
//   })
})
