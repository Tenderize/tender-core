import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction, Deployment} from 'hardhat-deploy/types'
import {
  ethers
} from "hardhat";

import {
  TenderToken, Tenderizer, ElasticSupplyPool, ERC20, Controller
} from "../typechain/";
import { BigNumber } from '@ethersproject/bignumber';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) { // the deploy function receive the hardhat runtime env as argument
  const {deployments, getNamedAccounts} = hre // Get the deployments and getNamedAccounts which are provided by hardhat-deploy
  const {deploy} = deployments // the deployments field itself contains the deploy function

  let bpoolAddr: string

  const {deployer} = await getNamedAccounts() // Fetch named accounts from hardhat.config.ts

  console.log("Deploying SafeMath library")

  const SafeMath = await deploy('SafeMath', {
    from: deployer, // msg.sender overwrite, use named Account
    log: true, // display the address and gas used in the console (not when run in test though)
  })

  console.log("Deploying BalancerSafeMath")
  const BalancerSafeMath = await deploy('BalancerSafeMath', {
    from: deployer, // msg.sender overwrite, use named account
    args: [], // constructor arguments
    log: true, // display the address and gas used in the console (not when run in test though)
  })

  console.log("Deploying Balancer RightsManager")
  const RightsManager = await deploy('RightsManager', {
    from: deployer,
    log: true
  })

  console.log("Deploying Balancer SmartPoolManager")
  const SmartPoolManager = await deploy('SmartPoolManager', {
    from: deployer,
    log: true
  })

  console.log("Deploying Balancer Factory")
  const BFactory = await deploy('BFactory', {
    from: deployer,
    log: true
  })


  const steakAmount = process.env.STEAK_AMOUNT || "0"

  const bootstrapSupply: BigNumber = ethers.utils.parseEther(steakAmount).div(2)

  console.log("Deploying Livepeer Tenderizer")

  const tenderizer = await deploy('Livepeer', {
    from: deployer,
    args: [process.env.LIVEPEER_TOKEN, process.env.LIVEPEER_BONDINGMANAGER, process.env.LIVEPEER_NODE],
    log: true, // display the address and gas used in the console (not when run in test though),
    libraries: {
      SafeMath: SafeMath.address
    }
  })

  console.log("Deploying Livepeer TenderToken")

  const tenderToken = await deploy('TenderToken', {
    from: deployer,
    args: ['Livepeer', 'LPT'],
    log: true, // display the address and gas used in the console (not when run in test though)
    libraries: {
      SafeMath: SafeMath.address
    }
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
    "poolTokenSymbol": "BAL-REBASING-SMART-V1-tLPT-LPT",
    "poolTokenName": "Balancer Rebasing Smart Pool Token V1 (tLPT-LPT)",
    "constituentTokens": [
      tenderToken.address,
      process.env.LIVEPEER_TOKEN
    ],
    "tokenBalances": [bootstrapSupply, bootstrapSupply],
    "tokenWeights": ["7071067811870000000", "7071067811870000000"],
    "swapFee": "3000000000000000"
  }

  console.log("Deploying Livepeer Elastic Supply Pool")

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

  console.log("Deploying Controller")

  const controller = await deploy('Controller', {
    from: deployer,
    log: true,
    args: [process.env.LIVEPEER_TOKEN, tenderizer.address, tenderToken.address, esp.address]
  })

  const TenderToken: TenderToken = (await ethers.getContractAt('TenderToken', tenderToken.address)) as TenderToken
  const Tenderizer: Tenderizer = (await ethers.getContractAt('Tenderizer', tenderizer.address)) as Tenderizer
  const Esp: ElasticSupplyPool = (await ethers.getContractAt('ElasticSupplyPool', esp.address)) as ElasticSupplyPool
  const Steak: ERC20 = (await ethers.getContractAt('ERC20', process.env.LIVEPEER_TOKEN || ethers.constants.AddressZero)) as ERC20
  const Controller: Controller = (await ethers.getContractAt('Controller', controller.address)) as Controller
  
  console.log("Transferring ownership for TenderToken to Controller")

  await TenderToken.transferOwnership(controller.address, {from: deployer, gasLimit: 1000000})
  
  console.log("Transferring ownership for Tenderizer to Controller")

  await Tenderizer.transferOwnership(controller.address, {from: deployer, gasLimit: 1000000})

  const pcTokenSupply = '1000000000000000000000' // 1000e18
  const minimumWeightChangeBlockPeriod = 10;
  const addTokenTimeLockInBlocks = 10;

  console.log("Approving Livepeer Token for depositing in Tenderizer")

  await Steak.approve(controller.address, bootstrapSupply)

  console.log("Depositing Livepeer Tokens in Tenderizer")

  await Controller.deposit(bootstrapSupply, {gasLimit: 500000})

  console.log("Approving Livepeer Token and Tender Livepeer Token for creating the Elastic Supply Pool")

  await Steak.approve(esp.address, bootstrapSupply)
  await TenderToken.approve(esp.address, bootstrapSupply)

  console.log("Creating Elastic Supply Pool")

  await Esp.createPool(pcTokenSupply, minimumWeightChangeBlockPeriod, addTokenTimeLockInBlocks, {gasLimit: 8000000})
  bpoolAddr = await Esp.bPool()

  console.log("Transferring ownership for Elastic Supply Pool to Controller")

  await Esp.setController(controller.address)

  console.log("Stake the deposited tokens")

  await Controller.gulp({gasLimit: 1500000})

  console.log("Balancer pool address", bpoolAddr)

  console.log("Succesfully Deployed ! ")
}

func.tags = ['Livepeer'] // this setup a tag so you can execute the script on its own (and its dependencies)
func.dependencies = ['SafeMath, Balancer']
export default func

