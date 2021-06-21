// import {HardhatRuntimeEnvironment} from 'hardhat/types'
// import {DeployFunction, Deployment} from 'hardhat-deploy/types'
// import {
//   ethers
// } from "hardhat";

// import {
//   TenderToken, Tenderizer, ElasticSupplyPool, ERC20, Controller
// } from "../typechain";
// import { BigNumber } from '@ethersproject/bignumber';

// const NAME = process.env.NAME || ""
// const SYMBOL = process.env.NAME || ""

// const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) { // the deploy function receive the hardhat runtime env as argument

//   if (!NAME || !SYMBOL) {
//     throw new Error("Must provide Tenderizer Name and Symbol");
//   }

//   const {deployments, getNamedAccounts} = hre // Get the deployments and getNamedAccounts which are provided by hardhat-deploy
//   const {deploy} = deployments // the deployments field itself contains the deploy function

//   let bpoolAddr: string

//   const {deployer} = await getNamedAccounts() // Fetch named accounts from hardhat.config.ts

//   const SafeMath = await deploy('SafeMath', {
//     from: deployer, // msg.sender overwrite, use named Account
//     log: true, // display the address and gas used in the console (not when run in test though)
//   })

//   const tenderizer = await deploy(NAME, {
//     from: deployer,
//     args: [process.env.TOKEN, process.env.CONTRACT, process.env.NODE],
//     log: true, // display the address and gas used in the console (not when run in test though),
//     libraries: {
//       SafeMath: SafeMath.address
//     },
//     proxy: {
//       owner: deployer,
//       methodName: 'initialize'
//     }
//   })
// }

// func.tags = [NAME, "Upgrade"] // this setup a tag so you can execute the script on its own (and its dependencies)
// export default func
