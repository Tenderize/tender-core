import { task, types } from 'hardhat/config'

task('generate-keystore', 'generate keystore file from private key')
  .addParam('privatekey', 'private key', '', types.string)
  .addParam('password', 'password to encrypt the keystore file with', '', types.string)
  .setAction(async (args, hre) => {
    const { ethers } = hre
    const wallet = new ethers.Wallet(args.privatekey)
    console.log(await wallet.encrypt(args.password))
  })
