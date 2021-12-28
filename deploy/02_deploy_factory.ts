import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy('Factory', {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [(await deployments.get('TenderSwap')).address, (await deployments.get('LiquidityPoolToken')).address]
  })
}

func.tags = ['Factory']
export default func
