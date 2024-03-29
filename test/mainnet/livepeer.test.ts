import hre, { ethers } from 'hardhat'

import {
  TenderToken, ILivepeer, Livepeer, ERC20, TenderFarm, TenderSwap, LiquidityPoolToken
} from '../../typechain'

import bondingManagerAbi from './abis/livepeer/BondingManager.json'
import adjustableRoundsManagerAbi from './abis/livepeer/AdjustableRoundsManager.json'
import uniswapV3QuoterAbi from './abis/livepeer/UniswapV3Quoter.json'

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
import { getCurrentBlockTimestamp } from '../util/evm'
import { utils } from 'ethers'

chai.use(solidity)
const {
  expect
} = chai

describe('Livepeer Mainnet Fork Test', () => {
  let LivepeerStaking: ILivepeer
  let LivepeerToken: ERC20
  let Tenderizer: Livepeer
  let TenderToken: TenderToken
  let TenderSwap: TenderSwap
  let LpToken: LiquidityPoolToken
  let TenderFarm: TenderFarm

  let Livepeer: { [name: string]: Deployment }

  let signers: SignerWithAddress[]
  let deployer: string
  let ownerBalanceBefore: BigNumber

  let tx: ContractTransaction
  const lockID = 0
  const protocolFeesPercent = ethers.utils.parseEther('50')
  const liquidityFeesPercent = ethers.utils.parseEther('50')

  const acceptableDelta = 2

  const MAX_ROUND = BigNumber.from(2).pow(256).sub(1)

  before('get signers', async () => {
    const namedAccs = await hre.getNamedAccounts()
    signers = await ethers.getSigners()

    deployer = namedAccs.deployer
  })

  const STEAK_AMOUNT = '1000'
  const NODE = '0xf4e8Ef0763BCB2B1aF693F5970a00050a6aC7E1B'
  const bondingManagerAddr = '0x35Bcf3c30594191d53231E4FF333E8A770453e40'
  const roundsManagerAddr = '0xdd6f56DcC28D3F5f27084381fE8Df634985cc39f'
  const ticketBrokerAddr = '0xa8bB618B1520E284046F3dFc448851A1Ff26e41B'
  const livepeerToken = '0x289ba1701C2F088cf0faf8B3705246331cB8A839'
  let bondingManager: Contract
  let roundsManager: Contract

  const tokenHolder = '0xea015c08ba1cd54a45a0c2e70563a247478e3644'

  const LPTDeployer = '0xb5af4138f0f33be0d6414eb25271b9c2dc245fb5'
  let multisigSigner: Signer
  const uniswapQuoter = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6'
  const uniswapRouter = '0xE592427A0AEce92De3Edee1F18E0157C05861564'
  const WETHAddress = '0x82af49447d8a07e3bd95bd0d56f35241523fbab1'

  const testTimeout = 1200000

  const ONE = ethers.utils.parseEther('1')

  const ALCHEMY_URL = process.env.ALCHEMY_ARBITRUM

  before('deploy Livepeer Tenderizer', async function () {
    this.timeout(testTimeout)
    // Fork from mainnet
    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [{
        forking: {
          jsonRpcUrl: ALCHEMY_URL,
          blockNumber: 50420799
        }
      }]
    })
    process.env.NAME = 'Livepeer'
    process.env.SYMBOL = 'LPT'
    process.env.CONTRACT = bondingManagerAddr
    process.env.TOKEN = livepeerToken
    process.env.VALIDATOR = NODE
    process.env.STEAK_AMOUNT = STEAK_AMOUNT
    process.env.ADMIN_FEE = '0'
    process.env.SWAP_FEE = '5000000'
    process.env.AMPLIFIER = '85'

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [tokenHolder]
    })
    await signers[0].sendTransaction({ to: tokenHolder, value: utils.parseEther('1') })
    const tokenHolderSigner = await ethers.provider.getSigner(tokenHolder)
    LivepeerToken = (await ethers.getContractAt('ERC20', livepeerToken)) as ERC20
    await LivepeerToken.connect(tokenHolderSigner).transfer(deployer, ethers.utils.parseEther(process.env.STEAK_AMOUNT).mul(5))
    await hre.network.provider.request({
      method: 'hardhat_stopImpersonatingAccount',
      params: [tokenHolder]
    })
    console.log('got tokens')
    await signers[0].sendTransaction({ to: LPTDeployer, value: utils.parseEther('1') })

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [LPTDeployer]
    })
    multisigSigner = await ethers.provider.getSigner(LPTDeployer)

    LivepeerStaking = (await ethers.getContractAt('ILivepeer', process.env.CONTRACT)) as ILivepeer

    Livepeer = await hre.deployments.fixture(['Livepeer'], {
      keepExistingDeployments: false
    })

    Tenderizer = (await ethers.getContractAt('Livepeer', Livepeer.Livepeer.address)) as Livepeer
    TenderToken = (await ethers.getContractAt('TenderToken', await Tenderizer.tenderToken())) as TenderToken
    TenderSwap = (await ethers.getContractAt('TenderSwap', await Tenderizer.tenderSwap())) as TenderSwap
    TenderFarm = (await ethers.getContractAt('TenderFarm', await Tenderizer.tenderFarm())) as TenderFarm
    LpToken = (await ethers.getContractAt('LiquidityPoolToken', await TenderSwap.lpToken())) as LiquidityPoolToken
    await Tenderizer.setProtocolFee(protocolFeesPercent)
    await Tenderizer.setLiquidityFee(liquidityFeesPercent)
    await Tenderizer.setUniswapRouter(uniswapRouter)

    // Deposit initial stake
    await LivepeerToken.approve(Tenderizer.address, initialStake)
    await Tenderizer.deposit(initialStake, { gasLimit: 500000 })
    // Add initial liquidity
    await LivepeerToken.approve(TenderSwap.address, initialStake)
    await TenderToken.approve(TenderSwap.address, initialStake)
    const lpTokensOut = await TenderSwap.calculateTokenAmount([initialStake, initialStake], true)
    await TenderSwap.addLiquidity([initialStake, initialStake], lpTokensOut, (await getCurrentBlockTimestamp()) + 1000)
    await LpToken.approve(TenderFarm.address, lpTokensOut)
    await TenderFarm.farm(lpTokensOut)
    // Initialize round
    roundsManager = new ethers.Contract(roundsManagerAddr, adjustableRoundsManagerAbi, ethers.provider)
    const initialized = await roundsManager.connect(multisigSigner).currentRoundInitialized()
    if (!initialized) {
      await roundsManager.connect(multisigSigner).initializeRound()
    }
  })

  const initialStake = ethers.utils.parseEther(STEAK_AMOUNT).div('2')

  const deposit = ethers.utils.parseEther('100')
  const withdrawAmount = ethers.utils.parseEther('100')

  describe('deposit', () => {
    it('reverts because transfer amount exceeds allowance', async () => {
      await expect(Tenderizer.deposit(deposit)).to.be.reverted
    })

    describe('deposits funds succesfully', async () => {
      before(async () => {
        await LivepeerToken.approve(Tenderizer.address, deposit)
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
    before(async function () {
      this.timeout(testTimeout * 10)
      tx = await Tenderizer.claimRewards()
    })

    it('bond succeeds', async () => {
      expect(await LivepeerStaking.pendingStake(Tenderizer.address, MAX_ROUND)).to.eq(initialStake.add(deposit))
    })

    it('emits Stake event from tenderizer', async () => {
      expect(tx).to.emit(Tenderizer, 'Stake').withArgs(NODE, initialStake.add(deposit))
    })
  })

  describe('rebase', () => {
    describe('stake increased', () => {
      let increase: BigNumber
      let newStake: BigNumber
      let totalShares: BigNumber = ONE
      let dyBefore: BigNumber
      let protocolFees: BigNumber
      let liquidityFees: BigNumber
      let swappedLPTRewards: BigNumber
      let ownerBalBefore: BigNumber
      let farmBalanceBefore: BigNumber

      before(async function () {
        ownerBalBefore = await TenderToken.balanceOf(deployer)
        farmBalanceBefore = await TenderToken.balanceOf(TenderFarm.address)

        dyBefore = await TenderSwap.calculateSwap(TenderToken.address, ONE)
        this.timeout(testTimeout * 10)
        bondingManager = new ethers.Contract(bondingManagerAddr, bondingManagerAbi, ethers.provider)
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
          `0x${ethers.utils.parseEther('10').toString()}`
        ])
        await bondingManager.connect(ticketBrokerSigner).updateTranscoderWithFees(NODE, ethers.utils.parseEther('0.10'), currentRound)

        // Get pending ETH FEES
        const pendingEthFees = await bondingManager.pendingFees(Tenderizer.address, MAX_ROUND)

        // Get current price of ETH -> LPT
        const uniQuoter = new ethers.Contract(uniswapQuoter, uniswapV3QuoterAbi, ethers.provider)
        swappedLPTRewards = await uniQuoter.callStatic.quoteExactInputSingle(
          WETHAddress,
          LivepeerToken.address,
          10000, // 1%
          pendingEthFees,
          0
        )

        increase = stakeAfter.sub(stakeBefore)
        liquidityFees = percOf2(increase.add(swappedLPTRewards), liquidityFeesPercent)
        protocolFees = percOf2(increase.add(swappedLPTRewards), protocolFeesPercent)
        newStake = deposit.add(initialStake).add(increase).add(swappedLPTRewards)
        farmBalanceBefore = await TenderToken.balanceOf(TenderFarm.address)
        // Transfer balance out before
        ownerBalanceBefore = await TenderToken.balanceOf(deployer)
        await TenderToken.connect(signers[0]).transfer(signers[3].address,
          ownerBalanceBefore)

        tx = await Tenderizer.claimRewards()
      })

      it('updates currentPrincipal', async () => {
        // Account for any slippage in the swap
        expect(await Tenderizer.currentPrincipal()).to.eq(newStake)
      })

      it('increases tendertoken balances when rewards are added', async () => {
        // account 0
        const shares = await TenderToken.sharesOf(deployer)
        totalShares = await TenderToken.getTotalShares()
        expect(await TenderToken.balanceOf(deployer)).to.eq(sharesToTokens(shares, totalShares, await TenderToken.totalSupply()))
      })

      it('increases the tenderToken balance of the AMM', async () => {
        const shares = await TenderToken.sharesOf(TenderSwap.address)
        expect(await TenderToken.balanceOf(TenderSwap.address)).to.eq(sharesToTokens(shares, totalShares, await TenderToken.totalSupply()))
      })

      it('steak balance stays the same', async () => {
        expect(await LivepeerToken.balanceOf(TenderSwap.address)).to.eq(initialStake)
      })

      it('tenderToken price slightly decreases vs underlying', async () => {
        expect(await TenderSwap.calculateSwap(TenderToken.address, ONE)).to.be.lt(dyBefore)
      })

      it('stakes all rewards claimed - drains tenderizer', async () => {
        expect(await LivepeerToken.balanceOf(Tenderizer.address)).to.eq(0)
      })

      it('collects fees', async () => {
        it('should increase tenderToken balance of owner', async () => {
          expect((await TenderToken.balanceOf(deployer)).sub(ownerBalBefore.add(protocolFees)).abs())
            .to.lte(acceptableDelta)
        })

        it('should emit ProtocolFeeCollected event from Tenderizer', async () => {
          expect(tx).to.emit(Tenderizer, 'ProtocolFeeCollected').withArgs(protocolFees)
        })
      })

      it('collects liquidity provider fees', async () => {
        it('should increase tenderToken balance of tenderFarm', async () => {
          expect((await TenderToken.balanceOf(TenderFarm.address)).sub(farmBalanceBefore.add(liquidityFees)).abs())
            .to.lte(acceptableDelta)
        })

        it('should emit ProtocolFeeCollected event from Tenderizer', async () => {
          expect(tx).to.emit(Tenderizer, 'LiquidityFeeCollected').withArgs(liquidityFees)
        })
      })

      it('should emit RewardsClaimed event from Tenderizer', async () => {
        // Not testing the values as there is some variable slippage depending on the block
        // TODO: Test with some acceptable delta
        expect(tx).to.emit(Tenderizer, 'RewardsClaimed')
      })
    })
  })

  describe('swap against TenderSwap', () => {
    it('swaps tenderToken for Token', async () => {
      // Trasnfer balance back
      await TenderToken.connect(signers[3]).transfer(deployer, ownerBalanceBefore)

      const amount = deposit.div(2)
      const lptBalBefore = await LivepeerToken.balanceOf(deployer)

      const dy = await TenderSwap.calculateSwap(TenderToken.address, amount)
      await TenderToken.approve(TenderSwap.address, amount)
      await TenderSwap.swap(
        TenderToken.address,
        amount,
        dy,
        (await getCurrentBlockTimestamp()) + 1000
      )

      const lptBalAfter = await LivepeerToken.balanceOf(deployer)
      expect(lptBalAfter.sub(lptBalBefore)).to.eq(dy)
    })
  })

  describe('unlock', async () => {
    let delBefore: BigNumber

    before('stake with another account', async () => {
      await LivepeerToken.transfer(signers[2].address, withdrawAmount)
      await LivepeerToken.connect(signers[2]).approve(Tenderizer.address, withdrawAmount)
      await Tenderizer.connect(signers[2]).deposit(withdrawAmount)
    })

    before(async () => {
      delBefore = await LivepeerStaking.pendingStake(Tenderizer.address, MAX_ROUND)
      tx = await Tenderizer.connect(signers[2]).unstake(withdrawAmount)
    })

    it('unbond() succeeds', async () => {
      expect(delBefore.sub(await LivepeerStaking.pendingStake(Tenderizer.address, MAX_ROUND))).to.eq(withdrawAmount)
    })

    it('reduces TenderToken Balance', async () => {
      // lte to account for any roundoff error in tokenToShare calcualtion during burn
      expect(await TenderToken.balanceOf(signers[2].address)).to.lte(acceptableDelta)
    })

    it('should create unstakeLock on Livepeer', async () => {
      const lock = await bondingManager.getDelegatorUnbondingLock(Tenderizer.address, lockID)
      expect(lock.amount).to.eq(withdrawAmount)
    })

    it('should emit Unstake event from Tenderizer', async () => {
      expect(tx).to.emit(Tenderizer, 'Unstake').withArgs(signers[2].address, NODE, withdrawAmount, lockID)
    })
  })

  describe('withdraw', async () => {
    it('reverts if wihtdraw() reverts - unbond period not complete', async () => {
      await expect(Tenderizer.withdraw(lockID)).to.be.reverted
    })

    it('wihtdraw() succeeeds - unstake lock is deleted', async () => {
      // Mine blocks for 7 rounds (withdraw period)
      const roundLength = await roundsManager.roundLength()
      for (let j = 0; j < roundLength * 7; j++) {
        await hre.ethers.provider.send('evm_mine', [])
      }
      await roundsManager.connect(multisigSigner).initializeRound()
      tx = await Tenderizer.connect(signers[2]).withdraw(lockID)
    }).timeout(testTimeout) // Set high timeout for test, to mine 7 rounds

    it('increases LPT balance', async () => {
      expect(await LivepeerToken.balanceOf(signers[2].address)).to.eq(withdrawAmount)
    })

    it('should emit Withdraw event from Tenderizer', async () => {
      expect(tx).to.emit(Tenderizer, 'Withdraw').withArgs(signers[2].address, withdrawAmount, lockID)
    })
  })
})
