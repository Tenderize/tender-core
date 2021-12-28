import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  const SwapUtils = await deploy('SwapUtils', {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true
  })

  await deploy('LiquidityPoolToken', {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true
  })

  await deploy('TenderSwap', {
    from: deployer,
    log: true,
    libraries: {
      SwapUtils: SwapUtils.address
    }
  })

  await deploy('TenderSwapFactory', {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [(await deployments.get('TenderSwap')).address,
      (await deployments.get('LiquidityPoolToken')).address]
  })
}

func.tags = ['TenderSwap']
export default func
