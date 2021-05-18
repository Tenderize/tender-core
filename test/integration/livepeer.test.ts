import hre, {ethers} from "hardhat"

import { MockContract, smockit } from '@eth-optimism/smock'

import {
    SimpleToken, LivepeerMock, Controller, Tenderizer, ElasticSupplyPool, TenderToken, ILivepeer
  } from "../../typechain/";

import chai from "chai";
import {
    solidity
} from "ethereum-waffle";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Deployment } from "hardhat-deploy/dist/types";

chai.use(solidity);
const {
    expect
} = chai;


describe('Livepeer Integration Test', () => {

    let LivepeerNoMock: ILivepeer
    let LivepeerMock: MockContract
    let LivepeerToken: SimpleToken
    let Controller: Controller
    let Tenderizer: Tenderizer
    let TenderToken: TenderToken
    let Esp: ElasticSupplyPool
    let bpoolAddr: string

    let Livepeer: {[name: string]: Deployment}

    let signers: SignerWithAddress[]
    let deployer: string
    let account1: string
    let account2: string
    let account3: string

    before('get signers', async () => {
        const namedAccs = await hre.getNamedAccounts()
        signers = await ethers.getSigners()

        deployer = namedAccs.deployer

        account1 = signers[1].address
        account2 = signers[2].address
        account3 = signers[3].address
    })

    before('deploy Livepeer token', async () => {
        const SimpleTokenFactory = await ethers.getContractFactory(
            'SimpleToken',
            signers[0]
        )

        LivepeerToken = (await SimpleTokenFactory.deploy('Livepeer Token', 'LPT', ethers.utils.parseEther("1000000"))) as SimpleToken
    })

    before('deploy Livepeer', async () => {
        const LivepeerFac = await ethers.getContractFactory(
            'LivepeerMock',
            signers[0]
        )

        LivepeerNoMock = (await LivepeerFac.deploy(LivepeerToken.address)) as ILivepeer

        LivepeerMock = await smockit(LivepeerNoMock)
    })

    const STEAK_AMOUNT = "100000"
    const NODE  = "0xf4e8Ef0763BCB2B1aF693F5970a00050a6aC7E1B"

    before('deploy Livepeer Tenderizer', async () => {
        process.env.LIVEPEER_BONDINGMANAGER = LivepeerMock.address
        process.env.LIVEPEER_TOKEN = LivepeerToken.address
        process.env.LIVEPEER_NODE = NODE
        process.env.STEAK_AMOUNT = STEAK_AMOUNT
        Livepeer = await hre.deployments.fixture(['Livepeer'])
        Controller = (await ethers.getContractAt('Controller', Livepeer['Controller'].address)) as Controller
        Tenderizer = (await ethers.getContractAt('Tenderizer', Livepeer['Livepeer'].address)) as Tenderizer
        TenderToken = (await ethers.getContractAt('TenderToken', Livepeer['TenderToken'].address)) as TenderToken
    })

    let initialStake = ethers.utils.parseEther(STEAK_AMOUNT).div("2")

    let deposit = ethers.utils.parseEther("100")

    describe('deposit', () => {

        it('reverts because transfer amount exceeds allowance', async () => {
            await expect(Controller.connect(signers[0]).deposit(deposit)).to.be.revertedWith('ERC20: transfer amount exceeds allowance')

        })
        it('deposits funds', async () => {
            await LivepeerToken.connect(signers[0]).approve(Controller.address, deposit)
            await Controller.connect(signers[0]).deposit(deposit)
            expect(await TenderToken.totalSupply()).to.eq(deposit.add(initialStake))
            expect(await Tenderizer.currentPrincipal()).to.eq(deposit.add(initialStake))
            expect(await TenderToken.balanceOf(deployer)).to.eq(deposit)
        })
    })

    describe('stake', () => {
        it('bond reverts', async () => {
            LivepeerMock.smocked.bond.will.revert()
            await expect(Controller.gulp()).to.be.reverted
        })

        it('bond succeeds', async () => {
            LivepeerMock.smocked.bond.will.return()
            await Controller.gulp()
            expect(LivepeerMock.smocked.bond.calls.length).to.eq(1)
            expect(LivepeerMock.smocked.bond.calls[0]._to).to.eq(NODE)
            // A smocked contract doesn't execute its true code
            // So livepeer.bond() never calls ERC20.transferFrom() under the hood
            // Therefore when we call gulp() it will be for the deposit and bootstrapped supply on deployment
            // Smock doesn't support executing code 
            expect(LivepeerMock.smocked.bond.calls[0]._amount).to.eq(deposit.add(initialStake))
        })
    })

})