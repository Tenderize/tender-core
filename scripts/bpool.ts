const hre = require("hardhat")
 
import {
  ElasticSupplyPool
} from "../typechain";

async function main () {
    const network = process.env.NETWORK
    const tenderizer = process.env.TENDERIZER

    const deployments = require(`../deployed/${network}/${tenderizer}.json`)

    const Esp: ElasticSupplyPool = (await hre.ethers.getContractAt('ElasticSupplyPool', deployments.contracts.ElasticSupplyPool.address)) as ElasticSupplyPool

    console.log(`Balancer Pool Address for ${tenderizer} on ${network}: ${await Esp.bPool()}`)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });