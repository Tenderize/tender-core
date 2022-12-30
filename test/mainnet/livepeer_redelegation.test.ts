import hre, { ethers } from 'hardhat'
import { Livepeer, EIP173Proxy, ILivepeer } from '../../typechain'
import adjustableRoundsManagerAbi from './abis/livepeer/AdjustableRoundsManager.json'
import uniswapV3QuoterAbi from './abis/livepeer/UniswapV3Quoter.json'

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { BigNumber } from 'ethers'
import { expect } from 'chai'

const TENDERIZE_OWNER = '0xc1cFab553835D74717c4499793EEa6Ef198A3031'
const ALCHEMY_URL = process.env.ALCHEMY_ARBITRUM
const TENDERIZER = '0x339efC059C6D4Aa50a41F8246a017B57Aa477b60'
const LIVEPEER_BONDINGMANAGER = '0x35Bcf3c30594191d53231E4FF333E8A770453e40'
const LIVEPEER_ROUNDSMANAGER = '0xdd6f56DcC28D3F5f27084381fE8Df634985cc39f'
const LIVEPEER_TOKEN = '0x289ba1701c2f088cf0faf8b3705246331cb8a839'
const WETH = '0x82af49447d8a07e3bd95bd0d56f35241523fbab1'
const UNISWAP_QUOTER = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6'
const NEW_NODE = '0x4a1c83b689816e40b695e2f2ce8fc21229076e74'

describe('Livepeer redelegation test', () => {
  let signers: SignerWithAddress[]
  let Livepeer: Livepeer
  before('fork mainnet', async () => {
    signers = await ethers.getSigners()

    // Fork from arbitrum
    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [{
        forking: {
          jsonRpcUrl: ALCHEMY_URL,
          blockNumber: 49521956 // 35424677 // 49521956
        }
      }]
    })

    Livepeer = (await ethers.getContractAt('Livepeer', TENDERIZER)) as Livepeer
  })

  describe('Upgrade Livepeer Tenderizer with migration function', () => {
    let stakeBefore: BigNumber
    before(async () => {
      stakeBefore = await Livepeer.currentPrincipal()
      // Send ETH to Tenderize owner
      await signers[0].sendTransaction({
        to: TENDERIZE_OWNER,
        value: ethers.utils.parseEther('1')
      })
      // Impersonate Tenderize owner
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [TENDERIZE_OWNER]
      })
      const deployerSigner = ethers.provider.getSigner(TENDERIZE_OWNER)
      const newLivepeer = await (await ethers.getContractFactory('Livepeer', deployerSigner)).deploy()
      const proxy = (await ethers.getContractAt('EIP173Proxy', TENDERIZER, deployerSigner)) as EIP173Proxy
      await proxy.upgradeTo(newLivepeer.address)
    })

    it('staked amount remains the same', async () => {
      const stakeAfter: BigNumber = await Livepeer.currentPrincipal()
      expect(stakeAfter).to.eq(stakeBefore)
    })
  })

  describe('Redelegate LPT to new node', () => {
    let expDelegatedAmount: BigNumber
    let BondingManager: ILivepeer
    before(async () => {
      BondingManager = (await ethers.getContractAt('ILivepeer', LIVEPEER_BONDINGMANAGER)) as ILivepeer
      const roundsManager = new ethers.Contract(LIVEPEER_ROUNDSMANAGER, adjustableRoundsManagerAbi, signers[0])

      const initialized = await roundsManager.currentRoundInitialized()
      if (!initialized) {
        await roundsManager.initializeRound()
      }

      const lptBal = await (await ethers.getContractAt('ERC20', LIVEPEER_TOKEN)).balanceOf(TENDERIZER)
      const pendingStake = await BondingManager.pendingStake(TENDERIZER, ethers.constants.MaxInt256)
      expDelegatedAmount = lptBal.add(pendingStake)

      const pendingFees = (await BondingManager.pendingFees(TENDERIZER, ethers.constants.MaxInt256)).add(await ethers.provider.getBalance(TENDERIZER))
      if (pendingFees.gte(1)) {
        const uniQuoter = new ethers.Contract(UNISWAP_QUOTER, uniswapV3QuoterAbi, ethers.provider)

        const feesToLPT = await uniQuoter.callStatic.quoteExactInputSingle(
          WETH,
          LIVEPEER_TOKEN,
          10000,
          pendingFees,
          0
        )
        expDelegatedAmount = expDelegatedAmount.add(feesToLPT)
      }

      // Impersonate Tenderize owner
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [TENDERIZE_OWNER]
      })
      const deployerSigner = ethers.provider.getSigner(TENDERIZE_OWNER)

      await Livepeer.connect(deployerSigner).migrateStake(NEW_NODE)
    })

    it('Changed the full delegated amount to the new node', async () => {
      const del = await BondingManager.getDelegator(TENDERIZER)
      expect(del.delegateAddress.toLocaleLowerCase()).to.eq(NEW_NODE.toLocaleLowerCase())
      const pendingStake = await BondingManager.pendingStake(TENDERIZER, ethers.constants.MaxInt256)
      expect(expDelegatedAmount).to.eq(del.bondedAmount)
      expect(expDelegatedAmount).to.eq(pendingStake)
      expect(expDelegatedAmount).to.eq(await Livepeer.currentPrincipal())
    })
  })
})
