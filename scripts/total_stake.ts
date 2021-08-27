import {
  TenderToken, Tenderizer
} from '../typechain'

const hre = require('hardhat')

async function main () {
  const network = process.env.NETWORK
  const tenderizer = process.env.TENDERIZER

  const deployments = require(`../deployments/${network}/${tenderizer}.json`)

  const TenderToken: TenderToken = (await hre.ethers.getContractAt('TenderToken', deployments.contracts.TenderToken.address)) as TenderToken
  const Tenderizer: Tenderizer = (await hre.ethers.getContractAt('Tenderizer', deployments.contracts[`${tenderizer}_Proxy`].address)) as Tenderizer
  console.log(hre.ethers.utils.formatEther(await Tenderizer.currentPrincipal()))
  console.log(hre.ethers.utils.formatEther(await TenderToken.getTotalPooledTokens()))
  console.log(hre.ethers.utils.formatEther(await TenderToken.totalSupply()))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
