import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  console.log('Deploying BalancerSafeMath')
  await deploy('BalancerSafeMath', {
    from: deployer, // msg.sender overwrite, use named account
    args: [], // constructor arguments
    log: true // display the address and gas used in the console (not when run in test though)
  })

  await deploy('RightsManager', {
    from: deployer,
    log: true
  })

  await deploy('SmartPoolManager', {
    from: deployer,
    log: true
  })

  await deploy('BFactory', {
    from: deployer,
    log: true
  })
}
func.tags = ['Libraries']
export default func
