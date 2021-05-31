const hre = require("hardhat")
 
import { ethers } from "ethers";
import { web3 } from "hardhat";
import {
  TenderToken, Tenderizer, ElasticSupplyPool, ERC20, Controller
} from "../typechain/";

const deployments = require('../deployments/rinkeby.json')
async function main () {

    const TenderToken: TenderToken = (await hre.ethers.getContractAt('TenderToken', deployments.contracts.TenderToken.address)) as TenderToken
    const Esp: ElasticSupplyPool = (await hre.ethers.getContractAt('ElasticSupplyPool', deployments.contracts.ElasticSupplyPool.address)) as ElasticSupplyPool
    const Controller: Controller = (await hre.ethers.getContractAt('Controller', deployments.contracts.Controller.address)) as Controller
    const Tenderizer: Tenderizer = (await hre.ethers.getContractAt('Tenderizer', deployments.contracts.Livepeer.address)) as Tenderizer
    const Token: ERC20 = (await hre.ethers.getContractAt('ERC20', process.env.TOKEN))
    // // First run scripts/rewards.js in livepeer protocol repo to generate rewards
    // // Then rebase
    // // Values should increase by a little bit

  //   const signers = await hre.ethers.getSigners()
  // console.log(signers)
  //   await Token.transfer(signers[1].address, ethers.utils.parseEther("1000"))
  //   await Token.connect(signers[1]).approve(deployments.contracts.Controller.address, ethers.utils.parseEther("1000"))
  //   console.log("approve")
  //   await Controller.connect(signers[1]).deposit(ethers.utils.parseEther("1000"))
  //   console.log("deposit")

      // console.log("bPool", await Esp.bPool())
      await Controller.rebase({gasLimit: 5000000})
    // // await Controller.gulp()
    // console.log((await Tenderizer.currentPrincipal()).toString())
    // console.log((await TenderToken.getTotalPooledTokens()).toString())
    // console.log((await TenderToken.totalSupply()).toString())
    // console.log(hre.ethers.utils.formatEther(await TenderToken.balanceOf(await Esp.bPool())))

}

setInterval(() => {
    main()
  }, 1800000)
