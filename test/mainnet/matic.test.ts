import hre, { ethers } from 'hardhat'
import {
  Controller, ElasticSupplyPool, TenderToken, IMatic, BPool, EIP173Proxy, Matic, ERC20
} from '../../typechain'

import rootChainAbi from './abis/matic/RootChain.json'

import chai from 'chai'
import {
  solidity
} from 'ethereum-waffle'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { Deployment } from 'hardhat-deploy/dist/types'
import { BigNumber } from '@ethersproject/bignumber'
import { Contract, ContractTransaction } from '@ethersproject/contracts'

import { Signer } from '@ethersproject/abstract-signer'
import { percOf2, sharesToTokens, buildsubmitCheckpointPaylod, getBlockHeader } from '../util/helpers'
const MerkleTree = require('../util/merkle-tree')
const ethUtils = require('ethereumjs-util')

chai.use(solidity)
const {
  expect
} = chai

describe('Matic Mainnet Fork Test', () => {
  let MaticStaking: IMatic
  let MaticToken: ERC20
  let Controller: Controller
  let Tenderizer: Matic
  let TenderToken: TenderToken
  let Esp: ElasticSupplyPool
  let BPool: BPool

  let Matic: {[name: string]: Deployment}

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
  const NODE = '0xaC1D6c20cE7F1fBF1915eFc0898D188b9C6A5CeD' // Validator share address
  const stakeManagerAddr = '0x5e3ef299fddf15eaa0432e6e66473ace8c13d908'
  const rootChainAddr = '0x86E4Dc95c7FBdBf52e33D563BbDB00823894C287'
  const childChainURL = 'https://matic-mainnet.chainstacklabs.com'

  const maticHolder = '0x2f7e209e0F5F645c7612D7610193Fe268F118b28'
  let maticHolderSinger: Signer

  const nodeSignerAddr = '0x7b5000af8ab69fd59eb0d4f5762bff57c9c04385'
  // TODO: Move to another file
  const otherSignersAddr = [
    '0xb79fad4ca981472442f53d16365fdf0305ffd8e9',
    '0xf0245f6251bef9447a08766b9da2b07b28ad80b0',
    '0x7c7379531b2aee82e4ca06d4175d13b9cbeafd49',
    '0x1ca971963bdb4ba2bf337c90660674acff5beb3f',
    '0x4f856f79f54592a48c8a1a1fafa1b0a3ac053f99',
    '0xbdbd4347b082d9d6bdf2da4555a37ce52a2e2120',
    '0xc6869257205e20c2a43cb31345db534aecb49f6e',
    '0xe77bbfd8ed65720f187efdd109e38d75eaca7385',
    '0x742d13f0b2a19c823bdd362b16305e4704b97a38',
    '0xbc6044f4a1688d8b8596a9f7d4659e09985eebe6',
    '0x959c65b72147faf3450d8b50a0de57e72ffc5e0d',
    '0x5b106f49f30620a07b4fbdcebb1e08b70499c851',
    '0xe4cd4c302befddf3d544301369ae3ed1481652fd',
    '0x5fe93ddf4490a02257bef079f2498650c97c44de',
    '0x8e9700392f9246a6c5b32ee3ecef586f156ed683',
    '0xb2dd091ea6e591d62f565d7a18ce2a7640add227',
    '0x10ad27a96cdbffc90ab3b83bf695911426a69f5e',
    '0x448aa1665fe1fae6d1a00a9209ea62d7dcd81a4b',
    '0xc35649ae99be820c7b200a0add09b96d7032d232',
    '0x25c32fd6ed7b84435a222084ef3fdbb36252b8de',
    '0x5973918275c01f50555d44e92c9d9b353cadad54',
    '0x4923de87853e95751a87eafe957a88a564387dac',
    '0xb702f1c9154ac9c08da247a8e30ee6f2f3373f41',
    '0xeb4f2a75cac4bbcb4d71c252e4cc80eb80bb3a34',
    '0x00856730088a5c3191bd26eb482e45229555ce57',
    '0xe63727cb2b3a8d6e3a2d1df4990f441938b67a34',
    '0x73d378cfeaa5cbe8daed64128ebdc91322aa586b',
    '0x28c0d4328520ed7e8657de141eee74a954b07c1f',
    '0x7e8024132d07e3e69c9bc2012dffe300b9c5807d',
    '0x9c56f33b968f83922bccf6d7689b9c883af9de49',
    '0x127685d6dd6683085da4b6a041efcef1681e5c9c',
    '0xb8bb158b93c94ed35c1970d610d1e2b34e26652c',
    '0x7fcd58c2d53d980b247f1612fdba93e9a76193e6',
    '0x02f70172f7f490653665c9bfac0666147c8af1f5',
    '0xa3bf7e661822fcc4f2129e93096cbb70dce6d3c9',
    '0x6237b2af1238d12248630ce21aa84f0952122232',
    '0xf84c74dea96df0ec22e11e7c33996c73fcc2d822',
    '0x951c881cab59ed669915a2b04ea5721600794ec3',
    '0x30dd252c7c150f26a3a06e4eada9e706db3fa58c',
    '0x055bd801ca712b4ddf67db8bc23fb6c8510d52b9',
    '0xcdfc898128dbc380a60895c6e8c0975dc07d07e0',
    '0x1d25c827abd466387bda00b429fe728627d6eee6',
    '0x85517022e380408b698ea0ea379d2b69f907c199',
    '0x98c27cc3f0301b6272049dc3f972e2f542780629',
    '0x414b4b5a2a0e303b89360eda83598ab7702eae04',
    '0x72f93a2740e00112d5f2cef404c0aa16fae21fa4',
    '0xe87d858ca83ffc1e8372b57b2d4f8aaaf8156f19',
    '0x6a654ca3bfb5cfb23bf30bafbf96b3b6ec26bb0e',
    '0x160cdef60e786295728a6ea334c091238e474e01',
    '0x42eefcda06ead475cde3731b8eb138e88cd0bac3',
    '0x54fab55f18248690264769ef9c0b3c30b8344b8e',
    '0x43c7c14d94197a30a44dab27bfb3eee9e05496d4',
    '0xe05ae0e76f582817c9e31d9c1a5c02287a31d689',
    '0xe05ae0e76f582817c9e31d9c1a5c02287a31d689',
    '0x2c74ca71679cf1299936d6104d825c965448907b',
    '0x0306b7d3095ab008927166cd648a8ca7dbe53f05',
    '0x13dc53fa54e7d662ff305b6c3ef95090c31dc576',
    '0x1a578699956c2174b4762de95316b3ad09ba34e9',
    '0x48aff66a7a9ce3b8fc4f62c80604bc310edf94cd',
    '0xd93622443da1f3e81cde6e2c0e482b4d8084251a',
    '0x6b2ed7e4b12a544ca7d215fed85dc16240d64aea',
    '0x8cb120478e9503760656c1fcac9c1539158bdb55',
    '0xc74d21957b34e4b9bae50e436a2581bd81ed581d',
    '0x90b11143a0cb64e067402307bc7f2276dcec8250',
    '0xe296cf6511ab951e026c620fb0e266db4d6de4a0',
    '0xde8da1ee512529b6c61fe7c769affc160308dea2',
    '0x55cc129dad4df3771a37770c6c0a469ff51918c8',
    '0x0208652a93baf5f1962849efcf5795eac7439a5e',
    '0xb0695fe376b48a3f39040ebbb2192e919c6b8aba',
    '0x406c3fef5969b36231bd573adfc34e16f54d23e0',
    '0xef46d5fe753c988606e6f703260d816af53b03eb',
    '0x62fb676db64f87fd1602048106476c6036d44c92',
    '0x4df34fac8313dcd3442064b90e22129ad82b5103',
    '0x13a9d78f4712a65678d7735682819b4f4f74253c',
    '0x26c80cc193b27d73d2c40943acec77f4da2c5bd8',
    '0x62bc6a92f4a4d0f5b4e16967b88db2d9e196c9f9',
    '0x28247de2d9829f3080899749b92e34959c06b59c',
    '0xa5a2c0eef6ee3e4b0bf79e0c9378d101d3cbec13',
    '0x8bbf92f4da9be0478464a077f582abd7b6df193c',
    '0x91935751ba30494c4fd276adcf134ecd66f8eca6',
    '0xd56fbe3294ea4d73cca99ff8751ce7bd9b688cd5',
    '0xd48611f40a37623bbcf9f047b8538177d879bad0',
    '0x959a4d857b7071c38878beb9dc77051b5fed1dfd',
    '0x3a9df5dfcb4cc102ce20d40434a2b1baca9eafd3',
    '0xddc6f0e66a442632f6c4fbf9eacf363170ee2916',
    '0x168b2779146ba862b04ca146385645eddb9d592e',
    '0x2a998cc0bb43dc510e523fe33c8f1c04bf607a1e',
    '0x30523527aced0ed2f5ce1721086d1d282d3af38f',
    '0xb5cb4fdb37e9fe8d7b8f473268128dfb4f862f4f',
    '0x374c87b673409e13053dbd35ebe868be42beabc5',
    '0xea7755c8fca76e6c1ecba0c678c5694ad8a85292',
    '0x3aeb7722c208c8f35fef5ec4f2ebf887beb59360',
    '0x18f371aeee4e2636df789931c9cd43e5d7b72d66',
    '0x00b69ba135b496b7f17fdfcd50d48b86bb397be6',
    '0x77ee14d1a9ba7130b686b736a316b5bf1d3ccb36'
  ]

  const testTimeout = 120000

  before('deploy Livepeer Tenderizer', async function () {
    this.timeout(testTimeout)
    // Fork from mainnet
    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [{
        forking: {
          blockNumber: 13222135,
          jsonRpcUrl: process.env.ALCHEMY_URL || 'https://eth-mainnet.alchemyapi.io/v2/s93KFT7TnttkCPdNS2Fg_HAoCpP6dEda'
        }
      }]
    })

    process.env.NAME = 'Matic'
    process.env.SYMBOL = 'MATIC'
    process.env.CONTRACT = stakeManagerAddr
    process.env.TOKEN = '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0'
    process.env.VALIDATOR = NODE
    process.env.BFACTORY = '0x9424B1412450D0f8Fc2255FAf6046b98213B76Bd'
    process.env.B_SAFEMATH = '0xCfE28868F6E0A24b7333D22D8943279e76aC2cdc'
    process.env.B_RIGHTS_MANAGER = '0xCfE28868F6E0A24b7333D22D8943279e76aC2cdc'
    process.env.B_SMART_POOL_MANAGER = '0xA3F9145CB0B50D907930840BB2dcfF4146df8Ab4'
    process.env.STEAK_AMOUNT = STEAK_AMOUNT

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [maticHolder]
    })
    maticHolderSinger = await ethers.provider.getSigner(maticHolder)

    // Transfer some ETH to matic Holder
    const ETHHolder = '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8'
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ETHHolder]
    })
    await hre.web3.eth.sendTransaction({ from: ETHHolder, to: maticHolder, value: ethers.utils.parseEther('10').toString() })

    // Transfer some MATIC
    MaticToken = (await ethers.getContractAt('ERC20', process.env.TOKEN)) as ERC20
    await MaticToken.connect(maticHolderSinger).transfer(deployer, ethers.utils.parseEther(process.env.STEAK_AMOUNT).mul(2))

    MaticStaking = (await ethers.getContractAt('IMatic', process.env.VALIDATOR)) as IMatic

    Matic = await hre.deployments.fixture(['Matic'], {
      keepExistingDeployments: false
    })
    Controller = (await ethers.getContractAt('Controller', Matic.Controller.address)) as Controller
    Tenderizer = (await ethers.getContractAt('Matic', Matic.Matic.address)) as Matic
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

  describe('deposit', () => {
    it('reverts because transfer amount exceeds allowance', async () => {
      await expect(Controller.deposit(deposit)).to.be.reverted
    })

    describe('deposits funds succesfully', async () => {
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
    let stakeBefore: BigNumber
    before(async () => {
      // Exchange rate would be 1 at this point, so can simply comapre the shares
      stakeBefore = await MaticStaking.balanceOf(Tenderizer.address)
      tx = await Controller.gulp()
    })

    it('bond succeeds', async () => {
      expect(await MaticStaking.balanceOf(Tenderizer.address)).to.eq(stakeBefore.add(deposit))
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
      const totalShares: BigNumber = ethers.utils.parseEther('1')
      const percDiv = ethers.utils.parseEther('1')

      before(async function () {
        this.timeout(testTimeout * 2)
        const sharesBefore = await MaticStaking.balanceOf(Tenderizer.address)
        let exRate = await MaticStaking.exchangeRate()
        const stakeBefore = sharesBefore.mul(exRate).div(EXCHAGE_RATE_PERCEISON)

        const rootChain = new ethers.Contract(rootChainAddr, rootChainAbi, ethers.provider)
        // Impersonate ownner
        const signers = []
        await hre.network.provider.request({
          method: 'hardhat_impersonateAccount',
          params: [nodeSignerAddr]
        })
        const nodeOwner = await ethers.provider.getSigner(nodeSignerAddr)
        signers.push(nodeOwner)

        // Impersonate other signers
        for (let i = 0; i < otherSignersAddr.length; i++) {
          await hre.network.provider.request({
            method: 'hardhat_impersonateAccount',
            params: [otherSignersAddr[i]]
          })
          signers.push(await ethers.provider.getSigner(otherSignersAddr[i]))
        }

        // Get block data from root chain
        const childWeb3 = new ethers.providers.JsonRpcProvider(childChainURL)
        const lastChildBlock = (await rootChain.getLastChildBlock()).toNumber()
        // Get only 10 blocks from child chian
        const start = lastChildBlock + 1
        const end = lastChildBlock + 11
        const headers = []
        for (let i = start; i <= end; i++) {
          const block = await childWeb3.getBlock(i)
          block.number = i
          headers.push(getBlockHeader(block))
        }

        const tree = new MerkleTree(headers)
        const root = ethUtils.bufferToHex(tree.getRoot())
        // Build data
        const { data, sigs } = await buildsubmitCheckpointPaylod(
          nodeSignerAddr,
          start,
          end,
          root,
          signers,
          {
            getSigs: true,
            allValidators: true,
            rewardsRootHash: ethers.constants.HashZero, // Changed from ''
            totalStake: 1,
            sigPrefix: ''
          }
        )
        // Submit block data
        await rootChain.connect(nodeOwner).submitCheckpoint(data, sigs)

        const sharesAfter = await MaticStaking.balanceOf(Tenderizer.address)
        exRate = await MaticStaking.exchangeRate()
        const stakeAfter = sharesAfter.mul(exRate).div(EXCHAGE_RATE_PERCEISON)
        increase = stakeAfter.sub(stakeBefore)
        console.log(increase)
        const liquidityFees = percOf2(increase.add(swappedLPTRewards), liquidityFeesPercent)
        const protocolFees = percOf2(increase.add(swappedLPTRewards), protocolFeesPercent)
        newStake = deposit.add(initialStake).add(increase)
        newStakeMinusFees = newStake.add(swappedLPTRewards).sub(liquidityFees.add(protocolFees))
        tx = await Controller.rebase()
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
