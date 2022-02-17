import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy('TenderFarm', {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true
  })

  await deploy('TenderFarmFactory', {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [
      (await deployments.get('TenderFarm')).address
    ]
  })
}

func.tags = ['TenderFarm', 'Dependencies']
export default func
