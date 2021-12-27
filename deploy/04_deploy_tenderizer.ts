import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import {
  ethers
} from 'hardhat'

import {
  Tenderizer, ERC20, TenderSwap, Registry
} from '../typechain'
import { constants } from 'ethers'

import dotenv from 'dotenv'

dotenv.config({ path: './deploy/.env' })
const NAME = process.env.NAME || ''
const SYMBOL = process.env.SYMBOL || ''

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) { // the deploy function receive the hardhat runtime env as argument
  if (!NAME || !SYMBOL) {
    throw new Error('Must provide Tenderizer Name and Symbol')
  }

  const { deployments, getNamedAccounts } = hre // Get the deployments and getNamedAccounts which are provided by hardhat-deploy
  const { deploy } = deployments // the deployments field itself contains the deploy function

  const { deployer } = await getNamedAccounts() // Fetch named accounts from hardhat.process.env.ts

  const tenderTokenConfig = {
    name: NAME,
    symbol: SYMBOL,
    tenderTokenTarget: (await deployments.get('TenderToken')).address
  }

  const tenderSwapConfig = {
    tenderSwapTarget: (await deployments.get('TenderSwap')).address,
    lpTokenName: `t${SYMBOL}-${SYMBOL} TenderSwap Token v1`,
    lpTokenSymbol: `t${SYMBOL}-${SYMBOL}-SWAP`,
    amplifier: 85,
    fee: 5e6,
    adminFee: 0,
    lpTokenTarget: (await deployments.get('LiquidityPoolToken')).address
  }

  const tenderizer = await deploy(NAME, {
    from: deployer,
    args: [
      process.env.TOKEN,
      process.env.CONTRACT,
      process.env.VALIDATOR,
      tenderTokenConfig,
      tenderSwapConfig,
      (await deployments.get('TenderFarm')).address
    ],
    log: true, // display the address and gas used in the console (not when run in test though),
    proxy: {
      proxyContract: 'EIP173ProxyWithReceive',
      owner: deployer,
      methodName: 'initialize'
    }
  })

  const Tenderizer: Tenderizer = (await ethers.getContractAt('Tenderizer', tenderizer.address)) as Tenderizer
  const swapAddress = await Tenderizer.tenderSwap()
  const tenderTokenAddress = await Tenderizer.tenderToken()
  const tenderFarmAddress = await Tenderizer.tenderFarm()

  console.log('Succesfully Deployed ! ')

  // register protocol
  const allDeployed = await deployments.all()
  if (allDeployed.Registry) {
    const registryAddr = allDeployed.Registry.address
    const Registry: Registry = (await ethers.getContractAt('Registry', registryAddr)) as Registry

    await Registry.addTenderizer({
      name: NAME,
      steak: process.env.TOKEN || constants.AddressZero,
      tenderizer: Tenderizer.address,
      tenderToken: tenderTokenAddress,
      tenderSwap: swapAddress,
      tenderFarm: tenderFarmAddress
    })
  } else if (hre.network.name === 'mainnet' || hre.network.name === 'rinkeby') {
    throw new Error('can not register Tenderizer, Registry not deployed')
  }

  // Deploy faucet if not mainnet
  if (hre.network.name !== 'mainnet') {
    const tokenAddress = process.env.TOKEN // Address of token
    const requestAmount = process.env.FAUCET_REQUEST_AMOUNT // Amount to dispense per request
    const requestWait = process.env.FAUCET_REQUEST_WAIT // Hours requester has to wait before requesting again
    const seedAmount = process.env.FAUCET_SEED_AMOUNT // Seed amount of tokens to be added to the faucet

    if (!tokenAddress || !requestAmount || !requestWait || !seedAmount) {
      console.log('Faucet ENVs are not set, skipping Faucet deployment')
      return
    }

    console.log(`Deploying ${SYMBOL} Faucet`)
    const Faucet = await deploy('TokenFaucet', {
      from: deployer,
      log: true,
      args: [tokenAddress, ethers.utils.parseEther(requestAmount), +requestWait]
    })

    // Add seed funds
    const Token: ERC20 = (await ethers.getContractAt('ERC20', tokenAddress)) as ERC20
    await Token.transfer(Faucet.address, ethers.utils.parseEther(seedAmount))
  }
}

func.dependencies = ['Registry', 'TenderToken', 'TenderSwap', 'TenderFarm']
func.tags = [NAME, 'Deploy'] // this setup a tag so you can execute the script on its own (and its dependencies)
export default func
