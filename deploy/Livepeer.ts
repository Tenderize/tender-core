import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction, Deployment} from 'hardhat-deploy/types'
import {
  ethers
} from "hardhat";

import {
  TenderToken, Tenderizer, ElasticSupplyPool
} from "../typechain/";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) { // the deploy function receive the hardhat runtime env as argument
  const {deployments, getNamedAccounts} = hre // Get the deployments and getNamedAccounts which are provided by hardhat-deploy
  const {deploy} = deployments // the deployments field itself contains the deploy function

  const {deployer} = await getNamedAccounts() // Fetch named accounts from hardhat.config.ts

  const safeMathFixture = await deployments.fixture(["SafeMath"])

  const balancerFixture = await deployments.fixture(["Balancer"])

  const tenderizer = await deploy('Livepeer', {
    from: deployer,
    args: [process.env.LIVEPEER_TOKEN, process.env.LIVEPEER_BONDINGMANAGER, process.env.LIVEPEER_ORCHESTRATOR],
    log: true, // display the address and gas used in the console (not when run in test though),
    libraries: {
      SafeMath: safeMathFixture["SafeMath"].address
    }
  })

  const tenderToken = await deploy('TenderToken', {
    from: deployer,
    args: ['Livepeer', 'LPT'],
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
    "poolTokenSymbol": "BAL-REBASING-SMART-V1-AMPL-USDC",
    "poolTokenName": "Balancer Rebasing Smart Pool Token V1 (AMPL-USDC)",
    "constituentTokens": [
      tenderToken.address,
      process.env.LIVEPEER_TOKEN
    ],
    "tokenBalances": ["100000000000","100000000"],
    "tokenWeights": ["7071067811870000000", "7071067811870000000"],
    "swapFee": "3000000000000000"
  }

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

  const controller = await deploy('Controller', {
    from: deployer,
    args: [ethers.constants.AddressZero, tenderizer.address, tenderToken.address, ethers.constants.AddressZero]
  })

  const TenderToken: TenderToken = (await ethers.getContractAt('TenderToken', tenderToken.address)) as TenderToken
  const Tenderizer: Tenderizer = (await ethers.getContractAt('Tenderizer', tenderizer.address)) as Tenderizer
  const Esp: ElasticSupplyPool = (await ethers.getContractAt('ElasticSupplyPool', esp.address)) as ElasticSupplyPool

  await TenderToken.transferOwnership(controller.address, {from: deployer})
  await Tenderizer.transferOwnership(controller.address, {from: deployer})
  await Esp.setController(controller.address) 

  // TODO: get steak and tenderToken
  // create ESP 
}
export default func
func.tags = ['Livepeer'] // this setup a tag so you can execute the script on its own (and its dependencies)

// TODO: Deployment strategy for a Tenderizer
// - Controller should probably be last 
// - However the ESP requires funds to be created
// - The Tenderizer only depends on outside dependencies so can be deployed first
// - The Token can be deployed and ownership transferred once the Controller is deployed 
