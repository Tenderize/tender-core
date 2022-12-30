import dotenv from 'dotenv'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

dotenv.config({ path: './deploy/.env' })
const NAME = process.env.NAME || ''
const SYMBOL = process.env.SYMBOL || ''

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    if (!NAME || !SYMBOL) {
        throw new Error('Must provide Tenderizer Name and Symbol')
    }

    console.log('Running 05')
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

func.dependencies = ['Registry', 'TenderToken', 'TenderSwap', 'TenderFarm', 'Tenderizer']
func.tags = ['Upgrade']
export default func
