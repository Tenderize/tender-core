import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import {
  ethers
} from 'hardhat'

import {
  TenderToken, Tenderizer, ERC20, Controller, EIP173Proxy, TenderFarm, Registry, TenderSwap, LiquidityPoolToken
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

  const steakAmount = process.env.STEAK_AMOUNT || '0'

  console.log(`Bootstrap Tenderizer with ${steakAmount} ${SYMBOL}`)

  const tenderizer = await deploy(NAME, {
    from: deployer,
    args: [process.env.TOKEN, process.env.CONTRACT, process.env.VALIDATOR],
    log: true, // display the address and gas used in the console (not when run in test though),
    proxy: {
      proxyContract: 'EIP173ProxyWithReceive',
      owner: deployer,
      methodName: 'initialize'
    }
  })

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

  const controller = await deploy('Controller', {
    from: deployer,
    log: true,
    args: [process.env.TOKEN, tenderizer.address, tenderSwapConfig, tenderTokenConfig],
    proxy: {
      proxyContract: 'EIP173ProxyWithReceive',
      owner: deployer,
      methodName: 'initialize'
    }
  })

  const Controller: Controller = (await ethers.getContractAt('Controller', controller.address)) as Controller

  const TenderSwap: TenderSwap = (await ethers.getContractAt(
    'TenderSwap',
    await Controller.tenderSwap()
  )) as TenderSwap

  const TenderToken: TenderToken = (await ethers.getContractAt(
    'TenderToken',
    await Controller.tenderToken()
  )) as TenderToken

  const LiquidityPoolToken = (await ethers.getContractAt(
    'LiquidityPoolToken',
    await TenderSwap.lpToken()
  )) as LiquidityPoolToken

  const Tenderizer: Tenderizer = (await ethers.getContractAt('Tenderizer', tenderizer.address)) as Tenderizer
  const Proxy: EIP173Proxy = (await ethers.getContractAt('EIP173Proxy', tenderizer.address)) as EIP173Proxy

  console.log('Setting controller on Tenderizer')
  await Tenderizer.setController(controller.address)
  await Proxy.transferOwnership(Controller.address)
  // console.log('Transferring ownership for TenderToken to Controller')
  // await TenderToken.transferOwnership(controller.address)

  // console.log('Approving tokens for depositing in Tenderizer')

  // await Steak.approve(controller.address, bootstrapSupply)

  // console.log('Depositing tokens in Tenderizer')

  // await Controller.deposit(bootstrapSupply, { gasLimit: 500000 })

  // console.log('Stake the deposited tokens')

  // await Controller.gulp({ gasLimit: 1500000 })

  console.log('Succesfully Deployed ! ')

  console.log('Deploy TenderFarm')

  const tenderFarm = await deploy('TenderFarm', {
    from: deployer,
    log: true,
    args: [LiquidityPoolToken.address, TenderToken.address, Controller.address],
    proxy: {
      proxyContract: 'EIP173ProxyWithReceive',
      owner: deployer,
      methodName: 'initialize'
    }
  })

  const TenderFarm: TenderFarm = (await ethers.getContractAt('TenderFarm', tenderFarm.address)) as TenderFarm
  const FarmProxy: EIP173Proxy = (await ethers.getContractAt('EIP173Proxy', tenderFarm.address)) as EIP173Proxy
  await FarmProxy.transferOwnership(controller.address)
  await Controller.setTenderFarm(FarmProxy.address)
  console.log('Deployed TenderFarm')

  // set liquidity fee
  const data = Tenderizer.interface.encodeFunctionData('setLiquidityFee', [ethers.utils.parseEther('0.075')])
  await Controller.execute(Tenderizer.address, 0, data)

  // register protocol
  const allDeployed = await deployments.all()
  if (allDeployed.Registry) {
    const registryAddr = allDeployed.Registry.address
    const Registry: Registry = (await ethers.getContractAt('Registry', registryAddr)) as Registry

    await Registry.addTenderizer({
      name: NAME,
      controller: Controller.address,
      steak: process.env.TOKEN || constants.AddressZero,
      tenderizer: Tenderizer.address,
      tenderToken: TenderToken.address,
      tenderSwap: TenderSwap.address,
      tenderFarm: TenderFarm.address
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

func.dependencies = ['Registry', 'TenderToken', 'TenderSwap']
func.tags = [NAME, 'Deploy'] // this setup a tag so you can execute the script on its own (and its dependencies)
export default func
