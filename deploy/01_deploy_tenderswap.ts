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
    },
    skipIfAlreadyDeployed: true
  })

  const ADMIN_FEE = process.env.ADMIN_FEE
  const FEE = process.env.SWAP_FEE
  const AMP = process.env.AMPLIFIER

  await deploy('TenderSwapFactoryV1', {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [
      (await deployments.get('TenderSwap')).address,
      (await deployments.get('LiquidityPoolToken')).address,
      AMP,
      FEE,
      ADMIN_FEE
    ]
  })
}

func.tags = ['TenderSwap', 'Dependencies']
export default func
