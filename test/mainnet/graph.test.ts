import hre, { ethers } from 'hardhat'
import { getCurrentBlockTimestamp } from '../util/evm'

import {
  TenderToken, ERC20, IGraph, TenderFarm, Tenderizer, TenderSwap, LiquidityPoolToken
} from '../../typechain'

import stakingAbi from './abis/graph/Staking.json'
import curationAbi from './abis/graph/Curation.json'
import epochManagerAbi from './abis/graph/EpochManager.json'

import chai from 'chai'
import {
  solidity
} from 'ethereum-waffle'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { Deployment } from 'hardhat-deploy/dist/types'
import { BigNumber } from '@ethersproject/bignumber'
import { Contract, ContractTransaction } from '@ethersproject/contracts'

import { percOf2 } from '../util/helpers'
import { Signer } from '@ethersproject/abstract-signer'
import { AlchemyProvider } from '@ethersproject/providers'

chai.use(solidity)
const {
  expect
} = chai

const ONE = ethers.utils.parseEther('10')

describe('Graph Mainnet Fork Test', () => {
  let GraphStaking: IGraph
  let GraphToken: ERC20
  let Tenderizer: Tenderizer
  let TenderToken: TenderToken
  let TenderFarm: TenderFarm
  let TenderSwap: TenderSwap
  let LpToken: LiquidityPoolToken

  let Graph: {[name: string]: Deployment}

  let signers: SignerWithAddress[]
  let deployer: string

  let withdrawAmount: BigNumber

  let tx: ContractTransaction
  const unbondLockID = 0

  const protocolFeesPercent = ethers.utils.parseEther('0.025')
  const liquidityFeesPercent = ethers.utils.parseEther('0.025')

  const acceptableDelta = 10

  before('get signers', async () => {
    const namedAccs = await hre.getNamedAccounts()
    signers = await ethers.getSigners()

    deployer = namedAccs.deployer
  })

  const STEAK_AMOUNT = '100000'
  const NODE = '0x4D6a8776a164776C93618233a0003E8894e7e6C2'
  const stakingAddr = '0xF55041E37E12cD407ad00CE2910B8269B01263b9'
  const curationAddr = '0x8FE00a685Bcb3B2cc296ff6FfEaB10acA4CE1538'
  const epochManagerAddr = '0x64F990Bf16552A693dCB043BB7bf3866c5E05DdB'

  const DELEGATION_TAX = BigNumber.from(5000)
  const MAX_PPM = BigNumber.from(1000000)

  const hexDeploymentID = '0x7cf8f2026b1f49a36f29293fb9545ce31ac3f71c40009c7e038d42ccea1b2b98' // ethers.utils.base58.decode(deploymentID).slice(2)
  let lastAllocationID: string
  let lastPoi: string

  const GRTHolder = '0xa64bc086d8bfaff4e05e277f971706d67559b1d1'
  const disputeArbitratorAddr = '0xe1fdd398329c6b74c14cf19100316f0826a492d3'
  const graphGovAddr = '0x48301fe520f72994d32ead72e2b6a8447873cf50'
  let GRTHolderSinger: Signer

  const testTimeout = 120000

  const initialStake = ethers.utils.parseEther(STEAK_AMOUNT).div('2')

  const ALCHEMY_KEY = 's93KFT7TnttkCPdNS2Fg_HAoCpP6dEda'

  before('deploy Graph Tenderizer', async function () {
    this.timeout(testTimeout)

    const latestBlockProvider = new AlchemyProvider('homestead', ALCHEMY_KEY)
    const stakingContract = new Contract(stakingAddr, stakingAbi, latestBlockProvider)
    const filter = await stakingContract.filters.AllocationClosed(NODE, null, null, null, null, null, null, null, null)
    const allocationClosedEvents = await stakingContract.queryFilter(filter)
    const allocationClosedTx = await allocationClosedEvents[allocationClosedEvents.length - 1].getTransaction()
    const stakingInterface = new ethers.utils.Interface(stakingAbi)
    const decodedInput = stakingInterface.parseTransaction({ data: allocationClosedTx.data, value: allocationClosedTx.value })
    lastAllocationID = decodedInput.args._allocationID
    lastPoi = decodedInput.args._poi

    // Fork from mainnet
    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [{
        forking: {
          blockNumber: allocationClosedTx.blockNumber! - 2,
          jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_KEY}`
        }
      }]
    })

    process.env.NAME = 'Graph'
    process.env.SYMBOL = 'GRT'
    process.env.CONTRACT = stakingAddr
    process.env.TOKEN = '0xc944e90c64b2c07662a292be6244bdf05cda44a7'
    process.env.VALIDATOR = NODE
    process.env.BFACTORY = '0x9424B1412450D0f8Fc2255FAf6046b98213B76Bd'
    process.env.B_SAFEMATH = '0xCfE28868F6E0A24b7333D22D8943279e76aC2cdc'
    process.env.B_RIGHTS_MANAGER = '0xCfE28868F6E0A24b7333D22D8943279e76aC2cdc'
    process.env.B_SMART_POOL_MANAGER = '0xA3F9145CB0B50D907930840BB2dcfF4146df8Ab4'
    process.env.STEAK_AMOUNT = STEAK_AMOUNT

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [GRTHolder]
    })
    GRTHolderSinger = await ethers.provider.getSigner(GRTHolder)

    // Transfer some ETH
    await hre.network.provider.send('hardhat_setBalance', [
      GRTHolder,
      `0x${ethers.utils.parseEther('100').toString()}`
    ])
    await hre.network.provider.send('hardhat_setBalance', [
      NODE,
      `0x${ethers.utils.parseEther('10').toString()}`
    ])
    await hre.network.provider.send('hardhat_setBalance', [
      disputeArbitratorAddr,
      `0x${ethers.utils.parseEther('10').toString()}`
    ])

    // Transfer some GRT
    GraphToken = (await ethers.getContractAt('ERC20', process.env.TOKEN)) as ERC20
    await GraphToken.connect(GRTHolderSinger).transfer(deployer, ethers.utils.parseEther(process.env.STEAK_AMOUNT).mul(2))
    await GraphToken.connect(GRTHolderSinger).transfer(NODE, ethers.utils.parseEther(process.env.STEAK_AMOUNT).mul(2))

    GraphStaking = (await ethers.getContractAt('IGraph', process.env.CONTRACT)) as IGraph

    Graph = await hre.deployments.fixture(['Graph'], {
      keepExistingDeployments: false
    })
    Tenderizer = (await ethers.getContractAt('Graph', Graph.Graph.address)) as Tenderizer
    TenderToken = (await ethers.getContractAt('TenderToken', await Tenderizer.tenderToken())) as TenderToken
    TenderSwap = (await ethers.getContractAt('TenderSwap', await Tenderizer.tenderSwap())) as TenderSwap
    TenderFarm = (await ethers.getContractAt('TenderFarm', await Tenderizer.tenderFarm())) as TenderFarm
    LpToken = (await ethers.getContractAt('LiquidityPoolToken', await TenderSwap.lpToken())) as LiquidityPoolToken
    await Tenderizer.setProtocolFee(protocolFeesPercent)
    await Tenderizer.setLiquidityFee(liquidityFeesPercent)

    // Set a shorter Epoch length so it's easier to test against
    const epochManager = new ethers.Contract(epochManagerAddr, epochManagerAbi, ethers.provider)
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [graphGovAddr]
    })
    const graphGov = await ethers.provider.getSigner(graphGovAddr)
    await epochManager.connect(graphGov).setEpochLength(1)

    // Deposit initial stake
    await GraphToken.approve(Tenderizer.address, initialStake)
    await Tenderizer.deposit(initialStake, { gasLimit: 500000 })
    // Add initial liquidity
    const liqAmount = initialStake
      .sub(initialStake.mul(DELEGATION_TAX).div(MAX_PPM))
    await GraphToken.approve(TenderSwap.address, liqAmount)
    await TenderToken.approve(TenderSwap.address, liqAmount)
    const lpTokensOut = await TenderSwap.calculateTokenAmount([liqAmount, liqAmount], true)
    await TenderSwap.addLiquidity([liqAmount, liqAmount], lpTokensOut, (await getCurrentBlockTimestamp()) + 1000)
    await LpToken.approve(TenderFarm.address, lpTokensOut)
    await TenderFarm.farm(lpTokensOut)
  })

  const deposit = ethers.utils.parseEther('100')

  const supplyAfterTax = deposit.add(initialStake)
    .sub(deposit.add(initialStake).mul(DELEGATION_TAX).div(MAX_PPM))

  describe('deposit', () => {
    it('reverts because transfer amount exceeds allowance', async () => {
      await expect(Tenderizer.deposit(deposit)).to.be.reverted
    })

    describe('deposits funds succesfully', async () => {
      before(async () => {
        await GraphToken.approve(Tenderizer.address, deposit)
        tx = await Tenderizer.deposit(deposit)
      })

      it('increases TenderToken supply', async () => {
        expect(await TenderToken.totalSupply()).to.eq(supplyAfterTax)
      })

      it('increases Tenderizer principle', async () => {
        expect(await Tenderizer.currentPrincipal()).to.eq(supplyAfterTax)
      })

      it('increases TenderToken balance of depositor', async () => {
        expect(await TenderToken.balanceOf(deployer))
          .to.eq(deposit.sub(deposit.mul(DELEGATION_TAX).div(MAX_PPM)))
      })

      it('emits Deposit event from tenderizer', async () => {
        expect(tx).to.emit(Tenderizer, 'Deposit').withArgs(deployer, deposit)
      })
    })
  })

  describe('stake', () => {
    let tokensBefore: BigNumber
    before(async () => {
      const sharesBefore = (await GraphStaking.getDelegation(NODE, Tenderizer.address)).shares
      const del = await GraphStaking.delegationPools(NODE)
      tokensBefore = sharesBefore.mul(del.tokens).div(del.shares)
      tx = await Tenderizer.claimRewards()
    })

    it('bond succeeds', async () => {
      const sharesBefore = (await GraphStaking.getDelegation(NODE, Tenderizer.address)).shares
      const del = await GraphStaking.delegationPools(NODE)
      // Account for 0.5% fee on deposit
      const actual = sharesBefore.mul(del.tokens).div(del.shares).sub(tokensBefore)
      const expected = initialStake.add(deposit).mul(995).div(1000)
      expect(actual.sub(expected).abs()).to.lt(acceptableDelta)
    })

    it('emits Stake event from tenderizer', async () => {
      expect(tx).to.emit(Tenderizer, 'Stake').withArgs(NODE, initialStake.add(deposit))
    })
  })

  describe('rebase', () => {
    let liquidityFees: BigNumber
    let protocolFees: BigNumber
    let dyBefore: BigNumber
    let ammBalanceBefore: BigNumber
    let deployerBalanceBefore: BigNumber

    describe('stake stays the same', () => {
      before(async function () {
        this.timeout(testTimeout * 10)
        dyBefore = await TenderSwap.calculateSwap(TenderToken.address, ONE)
        tx = await Tenderizer.claimRewards()
      })

      it('currentPrincipal stays the same', async () => {
        expect((await Tenderizer.currentPrincipal()).sub(supplyAfterTax).abs()).to.lt(acceptableDelta * 5)
      })

      it('tenderToken price stays the same', async () => {
        expect(await TenderSwap.calculateSwap(TenderToken.address, ONE)).to.be.eq(dyBefore)
      })

      it('should emit RewardsClaimed event from Tenderizer', async () => {
        // Sub 1 to account for round-off error
        expect(tx).to.emit(Tenderizer, 'RewardsClaimed')
          .withArgs(-1, supplyAfterTax.sub(1), supplyAfterTax)
      })
    })

    describe('stake increase', () => {
      let increase: BigNumber
      let stakeBefore: BigNumber
      let farmBalanceBefore: BigNumber
      let newStake: BigNumber
      let ownerBalBefore: BigNumber
      let otherAcc: SignerWithAddress
      let otherAccBalBefore: BigNumber

      before(async function () {
        otherAcc = signers[3]
        ownerBalBefore = await TenderToken.balanceOf(deployer)
        otherAccBalBefore = await TenderToken.balanceOf(otherAcc.address)
        farmBalanceBefore = await TenderToken.balanceOf(TenderFarm.address)
        this.timeout(testTimeout * 10)

        let shares = (await GraphStaking.getDelegation(NODE, Tenderizer.address)).shares
        let del = await GraphStaking.delegationPools(NODE)
        stakeBefore = shares.mul(del.tokens).div(del.shares)

        const curation = new ethers.Contract(curationAddr, curationAbi, ethers.provider)
        await hre.network.provider.request({
          method: 'hardhat_impersonateAccount',
          params: [NODE]
        })
        const indexerSinger = await ethers.provider.getSigner(NODE)

        // Mine 1k blocks
        for (let j = 0; j < 1000; j++) {
          await hre.ethers.provider.send('evm_mine', [])
        }
        await GraphToken.connect(indexerSinger).approve(curationAddr, ethers.utils.parseEther('1000'))
        await curation.connect(indexerSinger).mint(hexDeploymentID, ethers.utils.parseEther('1000'), 0)

        const w = hre.ethers.Wallet.createRandom()
        const channelKey = {
          privKey: w.privateKey,
          pubKey: w.publicKey,
          address: w.address,
          wallet: w,
          generateProof: (indexerAddress: string): Promise<string> => {
            const messageHash = hre.ethers.utils.solidityKeccak256(
              ['address', 'address'],
              [indexerAddress, w.address]
            )
            const messageHashBytes = hre.ethers.utils.arrayify(messageHash)
            return w.signMessage(messageHashBytes)
          }
        }
        const newAllocationID = channelKey.address
        const newPoi = await channelKey.generateProof(NODE)

        const staking = new ethers.Contract(stakingAddr, stakingAbi, ethers.provider)
        await staking.connect(indexerSinger).closeAndAllocate(
          lastAllocationID,
          lastPoi,
          NODE,
          hexDeploymentID,
          ethers.utils.parseEther('100'),
          newAllocationID,
          hre.ethers.constants.HashZero,
          newPoi
        )

        lastAllocationID = newAllocationID
        shares = (await GraphStaking.getDelegation(NODE, Tenderizer.address)).shares
        del = await GraphStaking.delegationPools(NODE)
        const stakeAfter = shares.mul(del.tokens).div(del.shares)
        increase = stakeAfter.sub(stakeBefore)

        liquidityFees = percOf2(increase, liquidityFeesPercent)
        protocolFees = percOf2(increase, protocolFeesPercent)
        // Account for delegation tax
        newStake = stakeAfter
        ammBalanceBefore = await TenderToken.balanceOf(TenderSwap.address)
        farmBalanceBefore = await TenderToken.balanceOf(TenderFarm.address)

        deployerBalanceBefore = await TenderToken.balanceOf(deployer)
        dyBefore = await TenderSwap.calculateSwap(TenderToken.address, ONE)
        tx = await Tenderizer.claimRewards()
      })

      it('updates currentPrincipal', async () => {
        expect((await Tenderizer.currentPrincipal()).sub(newStake).abs()).to.lt(acceptableDelta * 5)
      })

      it('increases tendertoken balances when rewards are added', async () => {
        expect(await TenderToken.balanceOf(deployer)).to.gt(deployerBalanceBefore)
      })

      it('increases the tenderToken balance of the AMM', async () => {
        expect(await TenderToken.balanceOf(TenderSwap.address)).to.gt(ammBalanceBefore)
      })

      it('tenderToken price slightly decreases vs underlying', async () => {
        expect(await TenderSwap.calculateSwap(TenderToken.address, ONE)).to.be.lt(dyBefore)
      })

      it('should emit RewardsClaimed event from Tenderizer', async () => {
        expect(tx).to.emit(Tenderizer, 'RewardsClaimed')
      })
      it('collects fees', async () => {
        it('should increase tenderToken balance of owner', async () => {
          expect((await TenderToken.balanceOf(deployer)).sub(ownerBalBefore.add(protocolFees)).abs())
            .to.lte(acceptableDelta)
        })

        it('should retain the balance for any other account', async () => {
          expect((await TenderToken.balanceOf(otherAcc.address))).to.eq(otherAccBalBefore)
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

        it('should retain the balance for any other account', async () => {
          expect((await TenderToken.balanceOf(otherAcc.address))).to.eq(otherAccBalBefore)
        })

        it('should emit ProtocolFeeCollected event from Tenderizer', async () => {
          expect(tx).to.emit(Tenderizer, 'LiquidityFeeCollected').withArgs(liquidityFees)
        })
      })
    })
  })

  describe('swap against TenderSwap', () => {
    it('swaps tenderToken for Token', async function () {
      const amount = deposit.div(2)
      const lptBalBefore = await GraphToken.balanceOf(deployer)

      const dy = await TenderSwap.calculateSwap(TenderToken.address, amount)
      await TenderToken.approve(TenderSwap.address, amount)
      await TenderSwap.swap(
        TenderToken.address,
        amount,
        dy,
        (await getCurrentBlockTimestamp()) + 1000
      )

      const lptBalAfter = await GraphToken.balanceOf(deployer)
      expect(lptBalAfter.sub(lptBalBefore)).to.eq(dy)
    })
  })

  describe('unlock', () => {
    describe('user unlock', async () => {
      before('transfer tokens to another account', async () => {
        withdrawAmount = await TenderToken.balanceOf(deployer)
        await TenderToken.transfer(signers[1].address, withdrawAmount)
      })

      it('reverts if user does not have enough tender token balance', async () => {
        await expect(Tenderizer.connect(signers[1]).unstake(withdrawAmount.add(ethers.utils.parseEther('1'))))
          .to.be.revertedWith('BURN_AMOUNT_EXCEEDS_BALANCE')
      })

      it('on success - updates current pricinple', async () => {
        const principleBefore = await Tenderizer.currentPrincipal()
        tx = await Tenderizer.connect(signers[1]).unstake(withdrawAmount)
        expect(await Tenderizer.currentPrincipal()).to.eq(principleBefore.sub(withdrawAmount))
      })

      it('reduces TenderToken Balance', async () => {
        // lte to account for any roundoff error in tokenToShare calcualtion during burn
        expect(await TenderToken.balanceOf(signers[1].address)).to.lte(acceptableDelta)
      })

      it('should emit Unstake event from Tenderizer', async () => {
        expect(tx).to.emit(Tenderizer, 'Unstake').withArgs(signers[1].address, NODE, withdrawAmount, unbondLockID)
      })
    })

    describe('gov unstake', async () => {
      before('undelegate() suceeds', async () => {
        tx = await Tenderizer.processUnstake()
      })

      it('should emit Unstake event from Tenderizer', async () => {
        expect(tx).to.emit(Tenderizer, 'ProcessUnstakes').withArgs(deployer, NODE, withdrawAmount)
      })
    })
  })

  describe('withdraw', () => {
    describe('gov withdrawal', async () => {
      it('user withdrawal reverts if gov withdrawal pending', async () => {
        await expect(Tenderizer.connect(signers[1]).withdraw(unbondLockID)).to.be.revertedWith('ONGOING_UNLOCK')
      })

      it('reverts if withdrawDelegated() fails - withdraw period pending', async () => {
        await expect(Tenderizer.processWithdraw()).to.be.reverted
      })

      it('withdrawDelegated() succeeds', async () => {
        for (let j = 0; j < 30; j++) {
          await hre.ethers.provider.send('evm_mine', [])
        }
        tx = await Tenderizer.processWithdraw()
        await tx.wait()
      }).timeout(testTimeout * 10)

      it('should emit Withdraw event from Tenderizer', async () => {
        expect(tx).to.emit(Tenderizer, 'ProcessWithdraws')
      })
    })

    describe('user withdrawal', async () => {
      let grtBalanceBefore : BigNumber
      it('reverts if account mismatch from unboondigLock', async () => {
        await expect(Tenderizer.connect(signers[2]).withdraw(unbondLockID))
          .to.be.revertedWith('ACCOUNT_MISTMATCH')
      })

      it('success - increases GRT balance', async () => {
        grtBalanceBefore = await GraphToken.balanceOf(signers[1].address)
        tx = await Tenderizer.connect(signers[1]).withdraw(unbondLockID)
        expect((await GraphToken.balanceOf(signers[1].address)).sub(grtBalanceBefore.add(withdrawAmount).abs()))
          .to.lte(acceptableDelta)
      })

      it('should emit Withdraw event from Tenderizer', async () => {
        expect(tx).to.emit(Tenderizer, 'Withdraw')
      })
    })
  })
})
