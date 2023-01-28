import dotenv from 'dotenv'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

dotenv.config({ path: './deploy/.env' })
const NAME = process.env.NAME || ''

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!NAME) {
    throw new Error('Must provide Tenderizer Name')
  }

  const { deployments, getNamedAccounts } = hre
  const { deployer } = await getNamedAccounts() // Fetch named accounts from hardhat.process.env.ts

  const tenderizerImplementation = await deployments.deploy(
    NAME, {
      from: deployer,
      args: [],
      log: true
    }
  )

  deployments.save(`${NAME}_Implementation`, tenderizerImplementation)
}

func.tags = ['Upgrade']
export default func
