const hre = require("hardhat")
 
import {
  TenderToken, Tenderizer
} from "../typechain";


async function main () {
    const network = process.env.NETWORK
    const tenderizer = process.env.TENDERIZER

    const deployments = require(`../deployed/${network}/${tenderizer}.json`)

    const TenderToken: TenderToken = (await hre.ethers.getContractAt('TenderToken', deployments.contracts.TenderToken.address)) as TenderToken
    const Tenderizer: Tenderizer = (await hre.ethers.getContractAt('Tenderizer', deployments.contracts.Graph.address)) as Tenderizer
    console.log(hre.ethers.utils.formatEther(await Tenderizer.currentPrincipal()))
    console.log(hre.ethers.utils.formatEther(await TenderToken.getTotalPooledTokens()))
    console.log(hre.ethers.utils.formatEther(await TenderToken.totalSupply()))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });