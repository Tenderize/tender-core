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

import { HardhatUserConfig } from 'hardhat/types'

import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

dotenv.config()
const PRIVATE_KEY = process.env.PRIVATE_KEY
const JSON_RPC = process.env.JSON_RPC

function loadTasks () {
  const tasksPath = path.join(__dirname, 'tasks')
  fs.readdirSync(tasksPath).forEach(task => {
    require(`${tasksPath}/${task}`)
  })
}

if (fs.existsSync(path.join(__dirname, 'artifacts'))) {
  loadTasks()
}

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      { version: '0.8.4', settings: {} },
      { version: '0.7.0', settings: {} }
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
    arbitrumMainnet: {
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
  }
}

export default config
