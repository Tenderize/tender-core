// export AMOUNT=50
// export TENDERIZER = 0x3b77b5f497b9c3555ba71c3958af940905b2936a
// export PRIVATE_KEY = ...
// export INFURA_KEY = ...
// npx hardhat run --network rinkeby scripts/add_liquidity.ts

import {
  TenderToken, Tenderizer, TenderSwap, ERC20
} from '../typechain'

import { signERC2612Permit } from 'eth-permit'
import { utils } from 'ethers'

const hre = require('hardhat')

async function main () {
  const tenderizer = process.env.TENDERIZER as string
  const amount = utils.parseEther(process.env.AMOUNT || '0')
  const provider = hre.ethers.providers.provider

  const signer = (await hre.ethers.getSigners())[0]

  const Tenderizer: Tenderizer = (await hre.ethers.getContractAt('Tenderizer', tenderizer)) as Tenderizer
  const TenderToken: TenderToken = (await hre.ethers.getContractAt('TenderToken', await Tenderizer.tenderToken()))
  const Steak: ERC20 = (await hre.ethers.getContractAt('ERC20', await Tenderizer.steak()))
  const TenderSwap: TenderSwap = (await hre.ethers.getContractAt('TenderSwap', await Tenderizer.tenderSwap())) as TenderSwap

  const deadline = ((new Date()).getTime() + 20 * 6000) / 1000

  const steakApproval = await signERC2612Permit(
    provider,
    Steak.address,
    signer.address,
    TenderSwap.address,
    amount.toString(),
    deadline
  )

  const tenderTokenApproval = await signERC2612Permit(
    provider,
    TenderToken.address,
    signer.address,
    TenderSwap.address,
    amount.toString(),
    deadline
  )

  const tx = await TenderSwap.multicall([
    TenderSwap.interface.encodeFunctionData(
      'selfPermit',
      [Steak.address, amount, deadline, steakApproval.v, steakApproval.r, steakApproval.s]
    ),
    TenderSwap.interface.encodeFunctionData(
      'selfPermit',
      [TenderToken.address, amount, deadline, tenderTokenApproval.v, tenderTokenApproval.r, tenderTokenApproval.s]
    ),
    TenderSwap.interface.encodeFunctionData(
      'addLiquidity',
      [[amount, amount], 0, deadline]
    )
  ])

  await tx.wait()

  console.log(
    'TenderToken reserve', utils.formatEther(await TenderSwap.getToken0Balance())
  )
  console.log(
    'Steak Reserve', utils.formatEther(await TenderSwap.getToken1Balance())
  )
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
