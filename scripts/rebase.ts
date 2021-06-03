const hre = require("hardhat")
 
import {
  Controller
} from "../typechain";

async function main () {
  const network = process.env.NETWORK
  const tenderizer = process.env.TENDERIZER

  const deployments = require(`../deployed/${network}/${tenderizer}.json`)
  const Controller: Controller = (await hre.ethers.getContractAt('Controller', deployments.contracts.Controller.address)) as Controller

  console.log(`Rebasing ${tenderizer} on ${network}`)
  const tx = await Controller.rebase({gasLimit: 5000000})
  await tx.wait()
  console.log("Rebase succeeded")

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });