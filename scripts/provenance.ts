const hre = require("hardhat")
 
import {
  Controller, EIP173Proxy
} from "../typechain";

async function main () {
  const network = process.env.NETWORK
  const tenderizer = process.env.TENDERIZER

  const deployments = require(`../deployments/${network}/${tenderizer}.json`)

  const ProxyAsImpl = await hre.ethers.getContractAt('Tenderizer', deployments.contracts[`${tenderizer}_Proxy`].address)
  const Proxy = await hre.ethers.getContractAt('EIP173Proxy', deployments.contracts[`${tenderizer}_Proxy`].address)
  console.log("Proxy Owner", await Proxy.owner(), deployments.contracts[`${tenderizer}_Proxy`].address)
  console.log("Livepeer controller", await ProxyAsImpl.controller(), deployments.contracts.Controller.address)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });