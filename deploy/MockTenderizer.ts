import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction, Deployment} from 'hardhat-deploy/types'
import {
  ethers
} from "hardhat";

import {
  TenderToken, Tenderizer, ElasticSupplyPool, SimpleToken
} from "../typechain/";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) { // the deploy function receive the hardhat runtime env as argument
  const {deployments, getNamedAccounts} = hre // Get the deployments and getNamedAccounts which are provided by hardhat-deploy
  const {deploy} = deployments // the deployments field itself contains the deploy function

  const {deployer} = await getNamedAccounts() // Fetch named accounts from hardhat.config.ts

  const balancerFixture = await deployments.fixture(["Balancer"])

  const steak = await deploy('SimpleToken', {
      from: deployer,
      args: ['SimpleToken', 'SIM', ethers.utils.parseEther("5000")],
  })

  const tenderizer = await deploy('MockTenderizer', {
    from: deployer,
    args: [steak.address, ethers.constants.AddressZero, ethers.utils.parseEther("50")],
    log: true, // display the address and gas used in the console (not when run in test though),
  })

  const tenderToken = await deploy('TenderToken', {
    from: deployer,
    args: ['Livepeer', 'LPT'],
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
  // const SimpleToken: SimpleToken = (await ethers.getContractAt('SimpleToken', steak.address))
  await TenderToken.transferOwnership(controller.address, {from: deployer})
  await Tenderizer.transferOwnership(controller.address, {from: deployer})
  await Esp.setController(controller.address) 

  // create ESP 
  // await SimpleToken.approve(controller.address, )
}
export default func
func.tags = ['Mock'] // this setup a tag so you can execute the script on its own (and its dependencies)

// TODO: Deployment strategy for a Tenderizer
// - Controller should probably be last 
// - However the ESP requires funds to be created
// - The Tenderizer only depends on outside dependencies so can be deployed first
// - The Token can be deployed and ownership transferred once the Controller is deployed 
