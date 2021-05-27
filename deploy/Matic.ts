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

  const safeMathFixture = await deployments.fixture(["SafeMath"])

  const balancerFixture = await deployments.fixture(["Balancer"])

  const steakAmount = process.env.STEAK_AMOUNT || "0"

  const bootstrapSupply: BigNumber = ethers.utils.parseEther(steakAmount).div(2)

  console.log("Deploying Matic Tenderizer")

  const tenderizer = await deploy('Matic', {
    from: deployer,
    args: [process.env.MATIC_TOKEN,  process.env.MATIC_STAKE_MANAGER/*dummy address*/, process.env.MATIC_VALIDATOR || deployer],
    log: true, // display the address and gas used in the console (not when run in test though),
    libraries: {
      SafeMath: safeMathFixture["SafeMath"].address
    }
  })

  console.log("Deploying Matic TenderToken")

  const tenderToken = await deploy('TenderToken', {
    from: deployer,
    args: ['Matic', 'MATIC'],
    log: true, // display the address and gas used in the console (not when run in test though)
    libraries: {
      SafeMath: safeMathFixture["SafeMath"].address
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
    "poolTokenSymbol": "BAL-REBASING-SMART-V1-tMATIC-MATIC",
    "poolTokenName": "Balancer Rebasing Smart Pool Token V1 (tMATIC-MATIC)",
    "constituentTokens": [
      tenderToken.address,
      process.env.MATIC_TOKEN
    ],
    "tokenBalances": [bootstrapSupply, bootstrapSupply],
    "tokenWeights": ["7071067811870000000", "7071067811870000000"],
    "swapFee": "3000000000000000"
  }

  console.log("Deploying Matic Elastic Supply Pool")

  const esp = await deploy('ElasticSupplyPool', {
    from: deployer,
    libraries: {
      BalancerSafeMath: balancerFixture["BalancerSafeMath"].address,
      RightsManager: balancerFixture["RightsManager"].address,
      SmartPoolManager: balancerFixture["SmartPoolManager"].address
    },
    log: true, // display the address and gas used in the console (not when run in test though)
    args: [balancerFixture["BFactory"].address, poolParams, permissions]
  })

  console.log("Deploying Controller")

  const controller = await deploy('Controller', {
    from: deployer,
    args: [process.env.MATIC_TOKEN, tenderizer.address, tenderToken.address, esp.address]
  })

  const TenderToken: TenderToken = (await ethers.getContractAt('TenderToken', tenderToken.address)) as TenderToken
  const Tenderizer: Tenderizer = (await ethers.getContractAt('Tenderizer', tenderizer.address)) as Tenderizer
  const Esp: ElasticSupplyPool = (await ethers.getContractAt('ElasticSupplyPool', esp.address)) as ElasticSupplyPool
  const Steak: ERC20 = (await ethers.getContractAt('ERC20', process.env.MATIC_TOKEN || ethers.constants.AddressZero)) as ERC20
  const Controller: Controller = (await ethers.getContractAt('Controller', controller.address)) as Controller
  
  console.log("Transferring ownership for TenderToken to Controller")

  await TenderToken.transferOwnership(controller.address, {from: deployer})
  
  console.log("Transferring ownership for Tenderizer to Controller")

  await Tenderizer.transferOwnership(controller.address, {from: deployer})

  const pcTokenSupply = '1000000000000000000000' // 1000e18
  const minimumWeightChangeBlockPeriod = 10;
  const addTokenTimeLockInBlocks = 10;

  console.log("Approving Matic Token for depositing in Tenderizer")

  await Steak.approve(controller.address, bootstrapSupply)

  console.log("Depositing Matic Tokens in Tenderizer")

  await Controller.deposit(bootstrapSupply)

  console.log("Approving Matic Token and Tender Matic Token for creating the Elastic Supply Pool")

  await Steak.approve(esp.address, bootstrapSupply)
  await TenderToken.approve(esp.address, bootstrapSupply)

  console.log("Creating Elastic Supply Pool")

  await Esp.createPool(pcTokenSupply, minimumWeightChangeBlockPeriod, addTokenTimeLockInBlocks)
  bpoolAddr = await Esp.bPool()

  console.log("Transferring ownership for Elastic Supply Pool to Controller")

  await Esp.setController(controller.address)

  console.log("Stake the deposited tokens")

  await Controller.gulp()

  console.log("Succesfully Deployed ! ")
}
export default func
func.tags = ['Matic'] // this setup a tag so you can execute the script on its own (and its dependencies)
