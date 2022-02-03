import hre, { ethers } from 'hardhat'

import {
  TenderToken, IAudius, Audius, ERC20, TenderFarm, TenderSwap, LiquidityPoolToken
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
import { getCurrentBlockTimestamp } from '../util/evm'

chai.use(solidity)
const {
  expect
} = chai

describe('Audius Mainnet Fork Test', () => {
  let AudiusStaking: IAudius
  let AudiusToken: ERC20
  let Tenderizer: Audius
  let TenderToken: TenderToken
  let TenderSwap: TenderSwap
  let LpToken: LiquidityPoolToken
  let TenderFarm: TenderFarm

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
  const NODE = '0x528D6Fe7dF9356C8EabEC850B0f908F53075B382'

  const delegateManagerAddr = '0x4d7968ebfD390D5E7926Cb3587C39eFf2F9FB225'
  const claimsManagerAddr = '0x44617F9dCEd9787C3B06a05B35B4C779a2AA1334'
  const govAddr = '0x4DEcA517D6817B6510798b7328F2314d3003AbAC'
  const guardianAddr = '0x7eE3c2091471474c9c4831A550f1a79DaBA0CcEf'
  const AUDIOHolder = '0x352e0242a58c4f43dc40f3ee9a2ea14ccc6bb2ea'

  const undelegateStakeRequestedTopic = '0x0c0ebdfe3f3ccdb3ad070f98a3fb9656a7b8781c299a5c0cd0f37e4d5a02556d'

  const testTimeout = 1200000

  const ONE = ethers.utils.parseEther('1')

  before('deploy Audius Tenderizer', async function () {
    this.timeout(testTimeout)
    // Fork from mainnet
    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [{
        forking: {
          jsonRpcUrl: process.env.ALCHEMY_MAINNET
        }
      }]
    })

    process.env.NAME = 'Audius'
    process.env.SYMBOL = 'AUDIO'
    process.env.CONTRACT = delegateManagerAddr
    process.env.TOKEN = '0x18aaa7115705e8be94bffebde57af9bfc265b998'
    process.env.VALIDATOR = NODE
    process.env.STEAK_AMOUNT = STEAK_AMOUNT

    await hre.network.provider.send('hardhat_setBalance', [
      AUDIOHolder,
      `0x${ethers.utils.parseEther('100').toString()}`
    ])

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [AUDIOHolder]
    })
    const AUDIOHolderSigner = await ethers.provider.getSigner(AUDIOHolder)

    // Transfer some ETH to Gov to execute txs
    await hre.network.provider.send('hardhat_setBalance', [
      guardianAddr,
      `0x${ethers.utils.parseEther('100').toString()}`
    ])

    // Transfer some AUDIO
    AudiusToken = (await ethers.getContractAt('ERC20', process.env.TOKEN)) as ERC20
    await AudiusToken.connect(AUDIOHolderSigner).transfer(deployer, ethers.utils.parseEther(STEAK_AMOUNT).mul(2))

    AudiusStaking = (await ethers.getContractAt('IAudius', process.env.CONTRACT)) as IAudius

    Audius = await hre.deployments.fixture(['Audius'], {
      keepExistingDeployments: false
    })
    Tenderizer = (await ethers.getContractAt('Audius', Audius.Audius.address)) as Audius
    TenderToken = (await ethers.getContractAt('TenderToken', await Tenderizer.tenderToken())) as TenderToken
    TenderSwap = (await ethers.getContractAt('TenderSwap', await Tenderizer.tenderSwap())) as TenderSwap
    TenderFarm = (await ethers.getContractAt('TenderFarm', await Tenderizer.tenderFarm())) as TenderFarm
    LpToken = (await ethers.getContractAt('LiquidityPoolToken', await TenderSwap.lpToken())) as LiquidityPoolToken
    await Tenderizer.setProtocolFee(protocolFeesPercent)
    await Tenderizer.setLiquidityFee(liquidityFeesPercent)

    // Deposit initial stake
    await AudiusToken.approve(Tenderizer.address, initialStake)
    await Tenderizer.deposit(initialStake, { gasLimit: 500000 })
    // Add initial liquidity
    await AudiusToken.approve(TenderSwap.address, initialStake)
    await TenderToken.approve(TenderSwap.address, initialStake)
    const lpTokensOut = await TenderSwap.calculateTokenAmount([initialStake, initialStake], true)
    await TenderSwap.addLiquidity([initialStake, initialStake], lpTokensOut, (await getCurrentBlockTimestamp()) + 1000)
    console.log('added liquidity')
    await LpToken.approve(TenderFarm.address, lpTokensOut)
    await TenderFarm.farm(lpTokensOut)
    console.log('farmed LP tokens')
  })

  const initialStake = ethers.utils.parseEther(STEAK_AMOUNT).div('2')

  const deposit = ethers.utils.parseEther('100')

  describe('deposit', () => {
    it('reverts because transfer amount exceeds allowance', async () => {
      await expect(Tenderizer.deposit(deposit)).to.be.reverted
    })

    describe('deposits funds succesfully', async () => {
      before(async () => {
        await AudiusToken.approve(Tenderizer.address, deposit)
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
    before(async () => {
      tx = await Tenderizer.claimRewards()
    })

    it('bond succeeds', async () => {
      expect(await AudiusStaking.getTotalDelegatorStake(Tenderizer.address)).to.eq(deposit.add(initialStake))
    })

    it('emits Stake event from tenderizer', async () => {
      expect(tx).to.emit(Tenderizer, 'Stake').withArgs(NODE, deposit.add(initialStake))
    })
  })

  describe('rebase', () => {
    let increase: BigNumber
    let liquidityFees: BigNumber
    let protocolFees: BigNumber
    let dyBefore: BigNumber

    describe('stake increased', () => {
      let newStakeMinusFees: BigNumber
      let newStake: BigNumber
      let totalShares: BigNumber = ethers.utils.parseEther('1')

      before(async function () {
        dyBefore = await TenderSwap.calculateSwap(TenderToken.address, ONE)
        this.timeout(testTimeout * 10)
        const claimsManager = new ethers.Contract(claimsManagerAddr, claimsManagerAbi, ethers.provider)

        const stakeBefore = await AudiusStaking.getTotalDelegatorStake(Tenderizer.address)

        // Mine blocks so new round can be initiated
        // Rounds can be initiated only once per week
        // TODO: Will promise.all() make things fater?
        for (let j = 0; j < 50000; j++) {
          await hre.ethers.provider.send('evm_mine', [])
        }

        // Initiate new round and distribute rewards
        await hre.network.provider.request({
          method: 'hardhat_impersonateAccount',
          params: [NODE]
        })
        const nodeSigner = await ethers.provider.getSigner(NODE)
        await claimsManager.connect(nodeSigner).initiateRound()

        tx = await Tenderizer.claimRewards()
        const stakeAfter = await AudiusStaking.getTotalDelegatorStake(Tenderizer.address)
        increase = stakeAfter.sub(stakeBefore)
        liquidityFees = percOf2(increase, liquidityFeesPercent)
        protocolFees = percOf2(increase, protocolFeesPercent)

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
        const shares = await TenderToken.sharesOf(TenderSwap.address)
        expect(await TenderToken.balanceOf(TenderSwap.address)).to.eq(sharesToTokens(shares, totalShares, await TenderToken.totalSupply()))
      })

      it('steak balance stays the same', async () => {
        expect(await AudiusToken.balanceOf(TenderSwap.address)).to.eq(initialStake)
      })

      it('tenderToken price slightly increases vs underlying', async () => {
        expect(await TenderSwap.calculateSwap(TenderToken.address, ONE)).to.be.lt(dyBefore)
      })

      it('should emit RewardsClaimed event from Tenderizer', async () => {
        expect(tx).to.emit(Tenderizer, 'RewardsClaimed')
          .withArgs(increase.sub(liquidityFees.add(protocolFees)), newStakeMinusFees, deposit.add(initialStake))
      })
    })

    describe('stake decrease', () => {
      // The decrease will offset the increase from the previous test
      let totalShares: BigNumber
      let oldPrinciple: BigNumber

      let feesBefore: BigNumber = ethers.constants.Zero
      let tx: ContractTransaction

      let dyBefore: BigNumber
      // calculate stake before rebase - fees
      let newStake: BigNumber

      before(async function () {
        dyBefore = await TenderSwap.calculateSwap(TenderToken.address, ONE)
        this.timeout(testTimeout)
        feesBefore = (await Tenderizer.pendingFees()).add(await Tenderizer.pendingLiquidityFees())
        oldPrinciple = (await AudiusStaking.getTotalDelegatorStake(Tenderizer.address)).sub(feesBefore)

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
        // Subtract protocol fees from last +ve rebase
        newStake = newStake.sub(liquidityFees.add(protocolFees))
        tx = await Tenderizer.claimRewards()
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
        expect((await Tenderizer.pendingFees()).add(await Tenderizer.pendingLiquidityFees())).to.eq(feesBefore)
      })

      it('decreases the tenderToken balance of the AMM', async () => {
        const shares = await TenderToken.sharesOf(TenderSwap.address)
        expect(await TenderToken.balanceOf(TenderSwap.address)).to.eq(sharesToTokens(shares, totalShares, await TenderToken.totalSupply()))
      })

      it('steak balance stays the same', async () => {
        expect(await AudiusToken.balanceOf(TenderSwap.address)).to.eq(initialStake)
      })

      it('price of the TenderTokens decreases vs the underlying', async () => {
        expect(await TenderSwap.calculateSwap(AudiusToken.address, ONE)).to.be.gt(dyBefore)
      })

      it('should emit RewardsClaimed event from Tenderizer with 0 rewards and currentPrinciple', async () => {
        expect(tx).to.emit(Tenderizer, 'RewardsClaimed').withArgs(newStake.sub(oldPrinciple), newStake, oldPrinciple)
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
      otherAccBalBefore = await TenderToken.balanceOf(otherAcc.address)
      tx = await Tenderizer.collectFees()
    })

    it('should reset pendingFees', async () => {
      expect(await Tenderizer.pendingFees()).to.eq(ethers.constants.Zero)
    })

    it('should increase tenderToken balance of owner', async () => {
      expect((await TenderToken.balanceOf(deployer)).sub(ownerBalBefore.add(fees)).abs())
        .to.lte(acceptableDelta)
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
      otherAccBalBefore = await TenderToken.balanceOf(otherAcc.address)
      tx = await Tenderizer.collectLiquidityFees()
    })

    it('should reset pendingFees', async () => {
      expect(await Tenderizer.pendingLiquidityFees()).to.eq(ethers.constants.Zero)
    })

    it('should increase tenderToken balance of tenderFarm', async () => {
      expect((await TenderToken.balanceOf(TenderFarm.address)).sub(farmBalanceBefore.add(fees)).abs())
        .to.lte(acceptableDelta)
    })

    it('should retain the balance for any other account', async () => {
      expect((await TenderToken.balanceOf(otherAcc.address))).to.eq(otherAccBalBefore)
    })

    it('should emit ProtocolFeeCollected event from Tenderizer', async () => {
      expect(tx).to.emit(Tenderizer, 'LiquidityFeeCollected').withArgs(fees)
    })
  })

  describe('swap against TenderSwap', () => {
    it('swaps tenderToken for Token', async () => {
      const amount = deposit.div(2)
      const lptBalBefore = await AudiusToken.balanceOf(deployer)

      const dy = await TenderSwap.calculateSwap(TenderToken.address, amount)
      await TenderToken.approve(TenderSwap.address, amount)
      await TenderSwap.swap(
        TenderToken.address,
        amount,
        dy,
        (await getCurrentBlockTimestamp()) + 1000
      )

      const lptBalAfter = await AudiusToken.balanceOf(deployer)
      expect(lptBalAfter.sub(lptBalBefore)).to.eq(dy)
    })
  })

  describe('unlock', () => {
    before('transfer tenderTokens from gov', async () => {
      await TenderToken.transfer(signers[2].address,
        await TenderToken.balanceOf(deployer))
    })

    describe('user unlock', async () => {
      it('reverts if user does not have enough tender token balance', async () => {
        withdrawAmount = await TenderToken.balanceOf(signers[2].address)
        await expect(Tenderizer.connect(signers[2]).unstake(withdrawAmount.add(ethers.utils.parseEther('1')))).to.be.revertedWith('BURN_AMOUNT_EXCEEDS_BALANCE')
      })

      it('on success - updates current pricinple', async () => {
        const principleBefore = await Tenderizer.currentPrincipal()
        tx = await Tenderizer.connect(signers[2]).unstake(withdrawAmount)
        expect(await Tenderizer.currentPrincipal()).to.eq(principleBefore.sub(withdrawAmount))
      })

      it('reduces TenderToken Balance', async () => {
        // lte to account for any roundoff error in tokenToShare calcualtion during burn
        expect(await TenderToken.balanceOf(deployer)).to.lte(acceptableDelta)
      })

      it('should emit Unstake event from Tenderizer', async () => {
        expect(tx).to.emit(Tenderizer, 'Unstake').withArgs(signers[2].address, NODE, withdrawAmount, unbondLockID)
      })
    })

    describe('gov unlock', async () => {
      before(async () => {
        tx = await Tenderizer.unstake(ethers.utils.parseEther('0'))
      })

      it('requestUndelegateStake() suceeds - event emitted', async () => {
        const rx = await tx.wait()
        if (rx.events === undefined) throw new Error('No events')
        expect(rx.events[0].topics[0]).to.eq(undelegateStakeRequestedTopic)
      })

      it('should emit Unstake event from Tenderizer', async () => {
        expect(tx).to.emit(Tenderizer, 'Unstake').withArgs(deployer, NODE, withdrawAmount, govUnboundLockID)
      })
    })
  })

  describe('withdraw', () => {
    describe('gov withdrawal', async () => {
      it('reverts if undelegateStake() reverts - lockup pending', async () => {
        await expect(Tenderizer.withdraw(govUnboundLockID)).to.be.reverted
      })

      it('undelegateStake() succeeds', async () => {
        // Mine blocks to complete lockup
        for (let j = 0; j < 46523; j++) {
          await hre.ethers.provider.send('evm_mine', [])
        }
        tx = await Tenderizer.withdraw(govUnboundLockID)
      }).timeout(testTimeout * 10)

      it('should emit Withdraw event from Tenderizer', async () => {
        expect(tx).to.emit(Tenderizer, 'Withdraw').withArgs(deployer, withdrawAmount, govUnboundLockID)
      })
    })

    describe('user withdrawal', async () => {
      let AUDIOBalanceBefore : BigNumber
      it('reverts if account mismatch from unboondigLock', async () => {
        await expect(Tenderizer.connect(signers[1]).withdraw(unbondLockID))
          .to.be.revertedWith('ACCOUNT_MISTMATCH')
      })

      it('success - increases AUDIO balance', async () => {
        AUDIOBalanceBefore = await AudiusToken.balanceOf(signers[2].address)
        tx = await Tenderizer.connect(signers[2]).withdraw(unbondLockID)
        expect(await AudiusToken.balanceOf(signers[2].address)).to.eq(AUDIOBalanceBefore.add(withdrawAmount))
      })

      it('should emit Withdraw event from Tenderizer', async () => {
        expect(tx).to.emit(Tenderizer, 'Withdraw').withArgs(signers[2].address, withdrawAmount, unbondLockID)
      })
    })
  })
})
