import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-web3'
import '@nomiclabs/hardhat-waffle'
import 'hardhat-typechain'

// deployment plugins
import 'hardhat-deploy'
import 'hardhat-deploy-ethers'
import '@openzeppelin/hardhat-upgrades'

// Tools
import 'hardhat-gas-reporter'
import 'solidity-coverage'
import '@nomiclabs/hardhat-etherscan'

import { HardhatUserConfig } from 'hardhat/types'

import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

dotenv.config()
const PRIVATE_KEY = process.env.PRIVATE_KEY
const JSON_RPC = process.env.JSON_RPC
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY
const ARBISCAN_API_KEY = process.env.ARBISCAN_API_KEY

function loadTasks() {
  const tasksPath = path.join(__dirname, 'tasks')
  fs.readdirSync(tasksPath).forEach(task => {
    require(`${tasksPath}/${task}`)
  })
}

if (
  fs.existsSync(path.join(__dirname, 'artifacts')) &&
  fs.existsSync(path.join(__dirname, 'typechain'))
) {
  loadTasks()
}

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: '0.8.4',
        settings: {
          optimizer: {
            runs: 200
          }
        }
      }
    ]
  },
  namedAccounts: {
    deployer: 0
  },
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      blockGasLimit: 12000000
    },
    mainnet: {
      url: JSON_RPC,
      accounts: PRIVATE_KEY ? [`0x${PRIVATE_KEY}`] : undefined
    },
    rinkeby: {
      url: JSON_RPC,
      accounts: PRIVATE_KEY ? [`0x${PRIVATE_KEY}`] : undefined
    },
    arbitrum: {
      url: JSON_RPC,
      accounts: PRIVATE_KEY ? [`0x${PRIVATE_KEY}`] : undefined
    },
    arbitrumRinkeby: {
      url: JSON_RPC,
      accounts: PRIVATE_KEY ? [`0x${PRIVATE_KEY}`] : undefined
    },
    localhost: {
      url: 'http://127.0.0.1:8545'
    }
  },
  gasReporter: {
    enabled: !!(process.env.REPORT_GAS)
  },
  mocha: {
    timeout: 200000
  },
  etherscan: {
    apiKey: {
      mainnet: ETHERSCAN_API_KEY,
      arbitrumOne: ARBISCAN_API_KEY
    }
  }
}

export default config
