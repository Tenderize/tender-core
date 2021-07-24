import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy } = deployments

  const { deployer } = await getNamedAccounts()

  const registry = await deploy('Registry', {
    from: deployer,
    log: true
  })

  await deployments.save('Registry', registry)
}
export default func
func.tags = ['Registry']