import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) { // the deploy function receive the hardhat runtime env as argument
  const {deployments, getNamedAccounts} = hre // Get the deployments and getNamedAccounts which are provided by hardhat-deploy
  const {deploy} = deployments // the deployments field itself contains the deploy function

  const {deployer} = await getNamedAccounts() // Fetch named accounts from hardhat.config.ts

  await deploy('SafeMath', {
    from: deployer, // msg.sender overwrite, use named Account
    log: true, // display the address and gas used in the console (not when run in test though)
  })
}
export default func
func.tags = ['SafeMath'] // this setup a tag so you can execute the script on its own (and its dependencies)