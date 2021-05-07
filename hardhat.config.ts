import "@nomiclabs/hardhat-ethers"
import "@nomiclabs/hardhat-web3"
import "@nomiclabs/hardhat-waffle"
import "hardhat-typechain"

// deployment plugins
import 'hardhat-deploy';
import 'hardhat-deploy-ethers';

import { HardhatUserConfig } from "hardhat/types"

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      { version: "0.5.12", settings: {} },
      { version: "0.6.12", settings: {} },
      { version: "0.8.0", settings: {} },
    ]
  },
  namedAccounts: {
    deployer: 0
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      gas: 12000000,
      allowUnlimitedContractSize: true,
      blockGasLimit: 12000000,
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/89c0af4958584a0f9dfffec473236056`
    },
    localhost: {
      url: "http://127.0.0.1:8545"
    }
  }
}

export default config
