import "@nomiclabs/hardhat-ethers"
import "@nomiclabs/hardhat-web3"
import "@nomiclabs/hardhat-waffle"
import "hardhat-typechain"

// deployment plugins
import 'hardhat-deploy';
import 'hardhat-deploy-ethers';

// Tools
import "hardhat-gas-reporter"
import "solidity-coverage"

import { HardhatUserConfig } from "hardhat/types"

const PRIVATE_KEY = process.env.PRIVATE_KEY || '182f9c4b5181c9bbf54cb7c142e13157353b62e4be815632a846ba351f3f78b0'
const INFURA_KEY = process.env.INFURA_KEY || '42a353682886462f9f7b6b602f577a53'

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      { version: "0.5.12", settings: {
        evmVersion: 'istanbul',
        optimizer: {
          enabled: true,
          runs: 200
        } 
      } },
      { version: "0.6.12", settings: {
        evmVersion: 'istanbul',
        optimizer: {
          enabled: true,
          runs: 200
        } 
      }
      },
      { version: "0.8.0", settings: {} },
      { version: "0.7.0", settings: {} }
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
      url: `https://mainnet.infura.io/v3/${INFURA_KEY}`,
      accounts: [`0x${PRIVATE_KEY}`]
    },
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${INFURA_KEY}`,
      accounts: [`0x${PRIVATE_KEY}`],
      allowUnlimitedContractSize: true,
      blockGasLimit: 12000000,
    },
    localhost: {
      url: "http://127.0.0.1:8545"
    }
  },
  gasReporter: {
    enabled: (process.env.REPORT_GAS) ? true : false
  }
}

export default config
