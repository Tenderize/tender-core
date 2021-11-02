import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import {
  ethers
} from 'hardhat'

import {
  TenderToken, Tenderizer, ElasticSupplyPool, ERC20, Controller, EIP173Proxy, TenderFarm, BPool, Registry, IGraph
} from '../typechain'
import { BigNumber } from '@ethersproject/bignumber'
import { constants, utils } from 'ethers'

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

  const bootstrapSupply: BigNumber = ethers.utils.parseEther(steakAmount).div(2)
  let tenderBootstrapSupply = bootstrapSupply

  console.log(`Bootstrap Tenderizer with ${steakAmount} ${SYMBOL}`)

  const tenderizer = await deploy(NAME, {
    from: deployer,
    args: [process.env.TOKEN, process.env.CONTRACT, process.env.VALIDATOR],
    log: true, // display the address and gas used in the console (not when run in test though),
    proxy: {
      owner: deployer,
      methodName: 'initialize'
    }
  })

  const tenderToken = await deploy('TenderToken', {
    from: deployer,
    args: [NAME, SYMBOL],
    log: true // display the address and gas used in the console (not when run in test though)
  })

  // Account for GRT Delegation Tax
  if (SYMBOL === 'GRT') {
    const graphStaking: IGraph = (await ethers.getContractAt('IGraph', process.env.CONTRACT as string)) as IGraph
    const tax = await graphStaking.delegationTaxPercentage()
    tenderBootstrapSupply = bootstrapSupply.sub(bootstrapSupply.mul(tax).div(1000000))
  }

  const permissions = {
    canPauseSwapping: true,
    canChangeSwapFee: true,
    canChangeWeights: true,
    canAddRemoveTokens: false,
    canWhitelistLPs: false,
    canChangeCap: false
  }

  const poolParams = {
    poolTokenSymbol: `t${SYMBOL}-${SYMBOL}-POOL`,
    poolTokenName: `${SYMBOL}-${SYMBOL} Pool Token V1`,
    constituentTokens: [
      tenderToken.address,
      process.env.TOKEN
    ],
    tokenBalances: [tenderBootstrapSupply, bootstrapSupply],
    tokenWeights: ['7071067811870000000', '7071067811870000000'],
    swapFee: '3000000000000000'
  }

  const BFactory = await deployments.get('BFactory')

  const esp = await deploy('ElasticSupplyPool', {
    from: deployer,
    libraries: {
      BalancerSafeMath: (await deployments.get('BalancerSafeMath')).address,
      RightsManager: (await deployments.get('RightsManager')).address,
      SmartPoolManager: (await deployments.get('SmartPoolManager')).address
    },
    log: true, // display the address and gas used in the console (not when run in test though)
    args: [BFactory.address, poolParams, permissions]
  })

  const controller = await deploy('Controller', {
    from: deployer,
    log: true,
    args: [process.env.TOKEN, tenderizer.address, tenderToken.address, esp.address]
  })

  const TenderToken: TenderToken = (await ethers.getContractAt('TenderToken', tenderToken.address)) as TenderToken
  const Tenderizer: Tenderizer = (await ethers.getContractAt('Tenderizer', tenderizer.address)) as Tenderizer
  const Esp: ElasticSupplyPool = (await ethers.getContractAt('ElasticSupplyPool', esp.address)) as ElasticSupplyPool
  const Steak: ERC20 = (await ethers.getContractAt('ERC20', process.env.TOKEN || ethers.constants.AddressZero)) as ERC20
  const Controller: Controller = (await ethers.getContractAt('Controller', controller.address)) as Controller
  const Proxy: EIP173Proxy = (await ethers.getContractAt('EIP173Proxy', tenderizer.address)) as EIP173Proxy

  console.log('Setting controller on Tenderizer')
  await Tenderizer.setController(controller.address)
  await Proxy.transferOwnership(Controller.address)
  console.log('Transferring ownership for TenderToken to Controller')
  await TenderToken.transferOwnership(controller.address)

  const pcTokenSupply = '1000000000000000000000' // 1000e18
  const minimumWeightChangeBlockPeriod = 10
  const addTokenTimeLockInBlocks = 10

  console.log('Approving tokens for depositing in Tenderizer')

  await Steak.approve(controller.address, bootstrapSupply)

  console.log('Depositing tokens in Tenderizer')

  await Controller.deposit(bootstrapSupply, { gasLimit: 500000 })

  console.log('Approving tokens and tender tokens for creating the Elastic Supply Pool')

  await Steak.approve(esp.address, bootstrapSupply)
  await TenderToken.approve(esp.address, tenderBootstrapSupply)

  console.log('Creating Elastic Supply Pool')

  const cpTxGas = hre.network.name === 'hardhat' ? 12000000 : 8000000
  const cpTx = await Esp.createPool(pcTokenSupply, minimumWeightChangeBlockPeriod, addTokenTimeLockInBlocks, { gasLimit: cpTxGas })
  await cpTx.wait()

  const bpoolAddr = await Esp.bPool()

  const BPool: BPool = (await ethers.getContractAt('BPool', bpoolAddr)) as BPool

  console.log('Transferring ownership for Elastic Supply Pool to Controller')

  await Esp.setController(controller.address)

  console.log('Stake the deposited tokens')

  await Controller.gulp({ gasLimit: 1500000 })

  console.log('Balancer pool address', bpoolAddr)

  console.log('Succesfully Deployed ! ')

  console.log('Deploy TenderFarm')

  const tenderFarm = await deploy('TenderFarm', {
    from: deployer,
    log: true,
    args: [await Esp.address, tenderToken.address, Controller.address],
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

  // Stake tokens in tenderfarm for deployer
  const lpTokenBal = await Esp.balanceOf(deployer)
  console.log('Liquidity Pool Tokens Received:', utils.formatEther(lpTokenBal))
  await Esp.approve(tenderFarm.address, lpTokenBal, { gasLimit: 1000000 })
  console.log('farming balancer pool tokens')
  await TenderFarm.farm(lpTokenBal, { gasLimit: 250000 })

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
      esp: Esp.address,
      bpool: BPool.address,
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

func.dependencies = ['Registry', 'Libraries']
func.tags = [NAME, 'Deploy'] // this setup a tag so you can execute the script on its own (and its dependencies)
export default func
