// external imports
import hre, { ethers } from 'hardhat'

// local imports
import { ERC20, IMaticStakeManager, Matic, IMatic, EIP173Proxy } from '../../typechain'

// types
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { BigNumber } from 'ethers'

// Config
const TOKEN_HOLDER = '0x50d669f43b484166680ecc3670e4766cdb0945ce'
const STEAK_AMOUNT = '100000'
const MATIC_STAKE_MANAGER = '0x5e3Ef299fDDf15eAa0432E6e66473ace8c13D908'
const MATIC_TOKEN = '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0'
const ALCHEMY_URL = process.env.ALCHEMY_MAINNET
const TENDERIZE_OWNER = '0x5542b58080FEE48dBE6f38ec0135cE9011519d96'

describe('Matic Mainnet Fork Test', () => {
  let MaticStakeManager: IMaticStakeManager
  let ValidatorShare: IMatic
  let MaticToken: ERC20
  let Tenderizer: Matic

  // let Matic: { [name: string]: Deployment }

  let signers: SignerWithAddress[]
  let deployer: string

  // Create new Matic signers
  // ---------------------------
  // const newMaticSigners = []
  // const accounts: any = config.networks.hardhat.accounts;

  const VALIDATOR_ID: number = 87
  let VALIDATOR_SHARE: string

  before('fork mainnet', async () => {
    // Fork from mainnet
    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [{
        forking: {
          jsonRpcUrl: ALCHEMY_URL,
          blockNumber: 16239470
        }
      }]
    })
  })

  before('get signers', async () => {
    const namedAccs = await hre.getNamedAccounts()
    signers = await ethers.getSigners()

    deployer = namedAccs.deployer
  })

  // Change all validator signers
  before('set up Matic', async () => {
    MaticToken = (await ethers.getContractAt('ERC20', MATIC_TOKEN)) as ERC20
    MaticStakeManager = (await ethers.getContractAt('IMaticStakeManager', MATIC_STAKE_MANAGER)) as IMaticStakeManager

    // Get tokens
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [TOKEN_HOLDER]
    })
    await signers[0].sendTransaction({
      to: TOKEN_HOLDER,
      value: ethers.utils.parseEther('1')
    })
    await MaticToken.connect(await ethers.provider.getSigner(TOKEN_HOLDER)).transfer(deployer, ethers.utils.parseEther(STEAK_AMOUNT).mul(5))
    await hre.network.provider.request({
      method: 'hardhat_stopImpersonatingAccount',
      params: [TOKEN_HOLDER]
    })

    const validator = await MaticStakeManager.validators(VALIDATOR_ID)
    VALIDATOR_SHARE = validator.contractAddress
    ValidatorShare = (await ethers.getContractAt('IMatic', VALIDATOR_SHARE)) as IMatic

    // Change validator signers
    // ------------------------
    // const validatorCount = (await MaticStakeManager.currentValidatorSetSize()).toNumber()

    // for (let i = 0; i < 9; i++) {
    //     // get signer
    //     const validator = await MaticStakeManager.validators(i);
    //     if (i === 8) {
    //         VALIDATOR_SHARE = validator.contractAddress
    //         VALIDATOR_ID = i
    //         VALIDATOR_ADDRESS = validator.signer
    //         ValidatorShare = (await ethers.getContractAt('IMatic', VALIDATOR_SHARE)) as IMatic
    //     }

    //     // impersonate
    //     await hre.network.provider.request({
    //         method: 'hardhat_impersonateAccount',
    //         params: [validator.signer]
    //     })
    //     const wallet = ethers.Wallet.fromMnemonic(accounts.mnemonic, accounts.path + `/${i}`);
    //     const signerPubKey = wallet.publicKey
    //     newMaticSigners.push(wallet.address)
    //     const validatorSigner = await ethers.provider.getSigner(validator.signer)
    //     await MaticStakeManager.connect(validatorSigner).updateSigner(i, signerPubKey)
    //     await hre.network.provider.request({
    //         method: "hardhat_stopImpersonatingAccount",
    //         params: [validator.signer],
    //     });
    // }
  })

  before('deploy Tenderizer', async () => {
    process.env.NAME = 'Matic'
    process.env.SYMBOL = 'MATIC'
    process.env.CONTRACT = MATIC_STAKE_MANAGER
    process.env.VALIDATOR = VALIDATOR_SHARE
    process.env.TOKEN = MATIC_TOKEN
    process.env.STEAK_AMOUNT = STEAK_AMOUNT
    process.env.ADMIN_FEE = '0'
    process.env.SWAP_FEE = '5000000'
    process.env.AMPLIFIER = '85'

    // Deploy fixture
    // Matic = await hre.deployments.fixture(['Matic'], {
    //     keepExistingDeployments: true
    // })

    // comment out when 'keepExistingDeployments = false'

    Tenderizer = (await ethers.getContractAt('Matic', '0xe07c344cB6a2Af8Fdf1d64c67D4C33a133fE7289')) as Matic
    ValidatorShare = (await ethers.getContractAt('IMatic', await Tenderizer.node())) as IMatic
  })

  describe('Deploy upgrade to fix withdraw Locks', async () => {
    before(async () => {
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [TENDERIZE_OWNER]
      })
      await signers[0].sendTransaction({
        to: TENDERIZE_OWNER,
        value: ethers.utils.parseEther('1')
      })
      const deployerSigner = ethers.provider.getSigner(TENDERIZE_OWNER)
      const newMatic = await (await ethers.getContractFactory('Matic', deployerSigner)).deploy()
      const proxy = (await ethers.getContractAt('EIP173Proxy', Tenderizer.address)) as EIP173Proxy
      await proxy.connect(deployerSigner).upgradeToAndCall(newMatic.address, Tenderizer.interface.encodeFunctionData('setWithdrawLockStart', [2]))
      await hre.network.provider.request({
        method: 'hardhat_stopImpersonatingAccount',
        params: [TENDERIZE_OWNER]
      })
      await MaticToken.approve(Tenderizer.address, ethers.utils.parseEther(STEAK_AMOUNT))
      await Tenderizer.deposit(ethers.utils.parseEther(STEAK_AMOUNT), { gasLimit: 500000 })
      await Tenderizer.claimRewards()
    })

    it('matches withdrawal lock ids for Tenderize and Matic', async () => {
      const tenderizeID = await Tenderizer.callStatic.unstake(ethers.utils.parseEther(STEAK_AMOUNT).div(2))
      await Tenderizer.unstake(ethers.utils.parseEther(STEAK_AMOUNT).div(2))
      const maticID = await ValidatorShare.unbondNonces(Tenderizer.address)
      expect(tenderizeID.toNumber()).to.eq(maticID.toNumber())
    })

    it('allows claiming the outstanding lock with ID 0, corresponding to Matic lock 1', async () => {
      const LOCK_OWNER = '0xa1ea52b245f7f3e29599c8c83a1016e09ddd2523'
      const fxRate = await ValidatorShare.withdrawExchangeRate()
      const fxRatePrec = BigNumber.from('10').pow(29)
      const maticLock = await ValidatorShare.unbonds_new(Tenderizer.address, 1)
      const amount = maticLock.shares.mul(fxRate).div(fxRatePrec)
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [LOCK_OWNER]
      })
      await signers[0].sendTransaction({
        to: LOCK_OWNER,
        value: ethers.utils.parseEther('1')
      })
      const balBefore = await MaticToken.balanceOf(LOCK_OWNER)
      await Tenderizer.connect(ethers.provider.getSigner(LOCK_OWNER)).withdraw(0)
      await hre.network.provider.request({
        method: 'hardhat_stopImpersonatingAccount',
        params: [LOCK_OWNER]
      })

      const balAfter = await MaticToken.balanceOf(LOCK_OWNER)
      expect(balBefore.add(amount)).to.eq(balAfter)
    })
  })
})
