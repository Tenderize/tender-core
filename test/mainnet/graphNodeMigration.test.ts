import hre, { ethers } from "hardhat";
import { getCurrentBlockTimestamp } from "../util/evm";

import { TenderToken, ERC20, Graph, EIP173Proxy } from "../../typechain";

import stakingAbi from "./abis/graph/Staking.json";
import curationAbi from "./abis/graph/Curation.json";
import epochManagerAbi from "./abis/graph/EpochManager.json";

import chai from "chai";
import { solidity } from "ethereum-waffle";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Deployment } from "hardhat-deploy/dist/types";
import { BigNumber } from "@ethersproject/bignumber";
import { Contract, ContractTransaction } from "@ethersproject/contracts";

import { percOf2 } from "../util/helpers";
import { Signer } from "@ethersproject/abstract-signer";
import { AlchemyProvider } from "@ethersproject/providers";

chai.use(solidity);
const { expect } = chai;

const ONE = ethers.utils.parseEther("10");

describe("Graph Mainnet Fork Test", () => {
  let GraphToken: ERC20;
  let Tenderizer: Graph;
  let TenderToken: TenderToken;
  let tenderizerOwner: Signer;

  let signers: SignerWithAddress[];
  let deployer: string;
  let cpBefore: BigNumber;

  before("get signers", async () => {
    const namedAccs = await hre.getNamedAccounts();
    signers = await ethers.getSigners();
    deployer = namedAccs.deployer;
  });

  const newNode = "0x63e2C9a3Db9fFd3cC108f08EAd601966EA031f5C";
  const stakingAddr = "0xF55041E37E12cD407ad00CE2910B8269B01263b9";
  const tenderizerAddr = "0xe66F3ab2f5621FE12ebf37754E1Af6d05b329A07";
  const grtTokenAddress = "0xc944e90c64b2c07662a292be6244bdf05cda44a7";
  const epochManagerAddr = "0x64F990Bf16552A693dCB043BB7bf3866c5E05DdB";
  const graphGovAddr = "0x48301fe520f72994d32ead72e2b6a8447873cf50";

  const GRTHolder = "0xa64bc086d8bfaff4e05e277f971706d67559b1d1";
  let GRTHolderSinger: Signer;

  const testTimeout = 120000;

  const DELEGATION_TAX = BigNumber.from(5000);
  const MAX_PPM = BigNumber.from(1000000);

  const ALCHEMY_KEY = "s93KFT7TnttkCPdNS2Fg_HAoCpP6dEda";

  before("deploy Graph Tenderizer", async function () {
    this.timeout(testTimeout);

    // Fork from mainnet
    await hre.network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            blockNumber: 16013315,
            jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_KEY}`,
          },
        },
      ],
    });

    process.env.CONTRACT = stakingAddr;

    // Set a shorter Epoch length so it's easier to test against
    const epochManager = new ethers.Contract(epochManagerAddr, epochManagerAbi, ethers.provider);
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [graphGovAddr],
    });
    const graphGov = await ethers.provider.getSigner(graphGovAddr);
    await epochManager.connect(graphGov).setEpochLength(1);

    Tenderizer = (await ethers.getContractAt("Graph", tenderizerAddr)) as Graph;

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [GRTHolder],
    });
    GRTHolderSinger = await ethers.provider.getSigner(GRTHolder);

    // Transfer some ETH
    await hre.network.provider.send("hardhat_setBalance", [
      GRTHolder,
      `0x${ethers.utils.parseEther("100").toString()}`,
    ]);

    // Transfer some GRT
    GraphToken = (await ethers.getContractAt("ERC20", grtTokenAddress)) as ERC20;
    await GraphToken.connect(GRTHolderSinger).transfer(deployer, ethers.utils.parseEther("100"));
  });

  describe("Perform Upgrade", async function () {
    before(async function () {
      cpBefore = await Tenderizer.currentPrincipal();
      const newFac = await ethers.getContractFactory("Graph", signers[0]);
      const newTenderizer = await newFac.deploy();
      const proxy = (await ethers.getContractAt("EIP173Proxy", Tenderizer.address)) as EIP173Proxy;
      await hre.network.provider.send("hardhat_setBalance", [
        await proxy.owner(),
        `0x${ethers.utils.parseEther("100").toString()}`,
      ]);

      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [await proxy.owner()],
      });
      tenderizerOwner = await ethers.provider.getSigner(await proxy.owner());
      await proxy.connect(tenderizerOwner).upgradeTo(newTenderizer.address);
    });

    it("current priciple stays the same", async function () {
      expect(await Tenderizer.currentPrincipal()).to.eq(cpBefore);
    });

    it("claimRewardsPaused is false", async function () {
      expect(await Tenderizer.claimRewardsPaused()).to.eq(false);
    });
  });

  describe("Migrate Stake", async function () {
    before(async function () {
      cpBefore = await Tenderizer.currentPrincipal();
      const govAddress = await Tenderizer.gov();
      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [govAddress],
      });
      const gov = await ethers.provider.getSigner(govAddress);
      const lockID = await Tenderizer.connect(gov).callStatic.rescueUnlock();
      // console.log((await Tenderizer.currentPrincipal()).toString());
      await Tenderizer.connect(gov).rescueUnlock();
      // console.log((await Tenderizer.currentPrincipal()).toString());
      await Tenderizer.connect(gov).processUnstake();
      // console.log((await Tenderizer.currentPrincipal()).toString());
      // TODO: Progress blocks
      for (let j = 0; j < 100; j++) {
        await hre.ethers.provider.send("evm_mine", []);
      }
      await Tenderizer.connect(gov).processWithdraw();
      // console.log((await Tenderizer.currentPrincipal()).toString());
      await Tenderizer.connect(gov).rescueWithdraw(lockID);
      // console.log((await Tenderizer.currentPrincipal()).toString());
      await Tenderizer.connect(gov).setNode(newNode);
      await Tenderizer.connect(gov).claimRewards();
      console.log((await Tenderizer.currentPrincipal()).toString());
    });

    it("new node is set", async function () {
      expect(await Tenderizer.node()).to.eq(newNode);
    });

    it("current priciple stays the same - delegation tax", async function () {
      const expCP = cpBefore.sub(cpBefore.mul(DELEGATION_TAX).div(MAX_PPM));
      console.log("diff:", expCP.sub(await Tenderizer.currentPrincipal()).toString());
      expect(await Tenderizer.currentPrincipal()).to.eq(expCP);
    });
  });
});
