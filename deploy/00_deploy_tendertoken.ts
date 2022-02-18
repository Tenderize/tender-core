import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy('TenderToken', {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    estimateGasExtra: 5000000
  })
}

func.tags = ['TenderToken', 'Dependencies']
export default func
