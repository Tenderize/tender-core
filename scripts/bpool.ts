import {
  ElasticSupplyPool
} from '../typechain'

import hre from 'hardhat'

async function main () {
  const network = process.env.NETWORK
  const tenderizer = process.env.TENDERIZER

  const deployments = require(`../deployments/${network}/${tenderizer}.json`)

  const Esp: ElasticSupplyPool = (await hre.ethers.getContractAt('ElasticSupplyPool', deployments.contracts.ElasticSupplyPool.address)) as ElasticSupplyPool
  // const Bpool: BPool = (await hre.ethers.getContractAt('BPool', await Esp.bPool()))

  console.log(`Balancer Pool Address for ${tenderizer} on ${network}: ${await Esp.bPool()}`)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
