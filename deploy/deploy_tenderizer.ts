import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction, Deployment} from 'hardhat-deploy/types'
import {
  ethers
} from "hardhat";

import {
  TenderToken, Tenderizer, ElasticSupplyPool, ERC20, Controller, EIP173Proxy, TenderFarm
} from "../typechain";
import { BigNumber } from '@ethersproject/bignumber';

const NAME = process.env.NAME || ""
const SYMBOL = process.env.SYMBOL || ""

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) { // the deploy function receive the hardhat runtime env as argument

  if (!NAME || !SYMBOL) {
    throw new Error("Must provide Tenderizer Name and Symbol");
  }

  const {deployments, getNamedAccounts} = hre // Get the deployments and getNamedAccounts which are provided by hardhat-deploy
  const {deploy} = deployments // the deployments field itself contains the deploy function

  let bpoolAddr: string

  const {deployer} = await getNamedAccounts() // Fetch named accounts from hardhat.config.ts

  console.log("Deploying BalancerSafeMath")
  const BalancerSafeMath = await deploy('BalancerSafeMath', {
    from: deployer, // msg.sender overwrite, use named account
    args: [], // constructor arguments
    log: true, // display the address and gas used in the console (not when run in test though)
  })

  const RightsManager = await deploy('RightsManager', {
    from: deployer,
    log: true
  })

  const SmartPoolManager = await deploy('SmartPoolManager', {
    from: deployer,
    log: true
  })

  const BFactory = await deploy('BFactory', {
    from: deployer,
    log: true
  })


  const steakAmount = process.env.STEAK_AMOUNT || "0"

  const bootstrapSupply: BigNumber = ethers.utils.parseEther(steakAmount).div(2)

  console.log(`Bootstrap Tenderizer with ${steakAmount} ${SYMBOL}`)

  const tenderizer = await deploy(NAME, {
    from: deployer,
    args: [process.env.TOKEN, process.env.CONTRACT, process.env.NODE],
    log: true, // display the address and gas used in the console (not when run in test though),
    proxy: {
      owner: deployer,
      methodName: 'initialize'
    }
  })

  const tenderToken = await deploy('TenderToken', {
    from: deployer,
    args: [NAME, SYMBOL],
    log: true, // display the address and gas used in the console (not when run in test though)
  })

  const permissions = {
    canPauseSwapping: true,
    canChangeSwapFee: true,
    canChangeWeights: true,
    canAddRemoveTokens: false,
    canWhitelistLPs: false,
    canChangeCap: false
  }
  
  const poolParams = {
    "poolTokenSymbol": `BAL-REBASING-SMART-V1-t${SYMBOL}-${SYMBOL}`,
    "poolTokenName": `Balancer Rebasing Smart Pool Token V1 (t${SYMBOL}-${SYMBOL})`,
    "constituentTokens": [
      tenderToken.address,
      process.env.TOKEN
    ],
    "tokenBalances": [bootstrapSupply, bootstrapSupply],
    "tokenWeights": ["7071067811870000000", "7071067811870000000"],
    "swapFee": "3000000000000000"
  }

  const esp = await deploy('ElasticSupplyPool', {
    from: deployer,
    libraries: {
      BalancerSafeMath: BalancerSafeMath.address,
      RightsManager: RightsManager.address,
      SmartPoolManager: SmartPoolManager.address
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

  console.log("Setting controller on Tenderizer")
  await Tenderizer.setController(controller.address)
  await Proxy.transferOwnership(Controller.address)
  console.log("Transferring ownership for TenderToken to Controller")
  await TenderToken.transferOwnership(controller.address)
  
  const pcTokenSupply = '1000000000000000000000' // 1000e18
  const minimumWeightChangeBlockPeriod = 10;
  const addTokenTimeLockInBlocks = 10;

  console.log("Approving tokens for depositing in Tenderizer")

  await Steak.approve(controller.address, bootstrapSupply)

  console.log("Depositing tokens in Tenderizer")

  await Controller.deposit(bootstrapSupply, {gasLimit: 500000})

  console.log("Approving tokens and tender tokens for creating the Elastic Supply Pool")

  await Steak.approve(esp.address, bootstrapSupply)
  await TenderToken.approve(esp.address, bootstrapSupply)

  console.log("Creating Elastic Supply Pool")

  await Esp.createPool(pcTokenSupply, minimumWeightChangeBlockPeriod, addTokenTimeLockInBlocks, {gasLimit: 12000000})
  bpoolAddr = await Esp.bPool()

  console.log("Transferring ownership for Elastic Supply Pool to Controller")

  await Esp.setController(controller.address)

  console.log("Stake the deposited tokens")

  await Controller.gulp({gasLimit: 1500000})

  console.log("Balancer pool address", bpoolAddr)

  console.log("Succesfully Deployed ! ")

  console.log("Deploy TenderFarm")
  const tenderFarm = await deploy('TenderFarm', {
    from: deployer,
    log: true,
    args: [await Esp.bPool(), tenderToken.address]
  })
  const TenderFarm: TenderFarm = (await ethers.getContractAt('TenderFarm', tenderFarm.address)) as TenderFarm 
  await TenderFarm.transferOwnership(controller.address)

  console.log("Deployed TenderFarm")

  // Deploy faucet if not mainnet
  if (hre.network.name != 'mainnet') {
    const tokenAddress = process.env.TOKEN // Address of token
    const requestAmount = process.env.FAUCET_REQUEST_AMOUNT // Amount to dispense per request
    const requestWait = process.env.FAUCET_REQUEST_WAIT // Hours requester has to wait before requesting again
    const seedAmount = process.env.FAUCET_SEED_AMOUNT // Seed amount of tokens to be added to the faucet
    
    if (!tokenAddress || !requestAmount || !requestWait || !seedAmount){
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
    Token.transfer(Faucet.address, ethers.utils.parseEther(seedAmount))
  }
}

func.tags = [NAME, "Deploy"] // this setup a tag so you can execute the script on its own (and its dependencies)
export default func
