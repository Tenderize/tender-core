const hre = require("hardhat")
 
import {
  TenderToken, Tenderizer, ElasticSupplyPool, ERC20, Controller
} from "../typechain/";

const deployments = require('../deployments/localhost.json')
async function main () {

    const TenderToken: TenderToken = (await hre.ethers.getContractAt('TenderToken', deployments.contracts.TenderToken.address)) as TenderToken
    const Esp: ElasticSupplyPool = (await hre.ethers.getContractAt('ElasticSupplyPool', deployments.contracts.ElasticSupplyPool.address)) as ElasticSupplyPool
    const Controller: Controller = (await hre.ethers.getContractAt('Controller', deployments.contracts.Controller.address)) as Controller
     
    // First run scripts/rewards.js in livepeer protocol repo to generate rewards
    // Then rebase
    // Values should increase by a little bit
    await Controller.rebase()
    console.log((await TenderToken.getTotalPooledTokens()).toString())
    console.log((await TenderToken.totalSupply()).toString())
    console.log(hre.ethers.utils.formatEther(await TenderToken.balanceOf(await Esp.bPool())))

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });