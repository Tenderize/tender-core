// export TENDERIZER = 0x3b77b5f497b9c3555ba71c3958af940905b2936a
// export INFURA_KEY = ...
// npx hardhat run --network rinkeby scripts/tenderizer_info.ts

import { TenderToken, Tenderizer, TenderSwap, ERC20, TenderFarm, LiquidityPoolToken } from '../typechain'
const hre = require('hardhat')

async function main () {
  const tenderizer = process.env.TENDERIZER as string

  const Tenderizer: Tenderizer = (await hre.ethers.getContractAt('Tenderizer', tenderizer)) as Tenderizer
  const TenderToken: TenderToken = await hre.ethers.getContractAt('TenderToken', await Tenderizer.tenderToken())
  const Steak: ERC20 = await hre.ethers.getContractAt('ERC20', await Tenderizer.steak())
  const TenderSwap: TenderSwap = (await hre.ethers.getContractAt(
    'TenderSwap',
    await Tenderizer.tenderSwap()
  )) as TenderSwap

  const LpToken: LiquidityPoolToken = (await hre.ethers.getContractAt('LiquidityPoolToken', await TenderSwap.lpToken())) as LiquidityPoolToken
  const TenderFarm = (await hre.ethers.getContractAt('TenderFarm', await Tenderizer.tenderFarm())) as TenderFarm

  console.log(`Tenderizer ${Tenderizer.address}`)
  console.log(`TenderToken ${TenderToken.address}`)
  console.log(`Staking Token ${Steak.address}`)
  console.log(`TenderSwap ${TenderSwap.address}  -  LP Token ${LpToken.address}`)
  console.log(`TenderFarm ${TenderFarm.address}`)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
