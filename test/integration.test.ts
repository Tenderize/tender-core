import {
    ethers
} from "hardhat";
import ethersTypes, { BigNumber } from "ethers"
import {
    solidity
} from "ethereum-waffle";
import {
    Controller, SimpleToken, MockTenderizer, TenderToken, ElasticSupplyPool, BPool, ConfigurableRightsPool
} from "../typechain/";
import hre from "hardhat"
chai.use(solidity);
const {
    expect
} = chai;

import * as rpc from "./util/snapshot"

describe('Integration test', () => {
    let snapshotId: any
    
    let controller: Controller
    let steak: SimpleToken
    let tenderizer: MockTenderizer
    let tenderToken: TenderToken
    let esp: ElasticSupplyPool
    let bpoolAddr: string

    let signers: ethersTypes.Signer[]

    const initialSupply = ethers.utils.parseEther("5000000")
    
    let deployer: string
    let account0: string
    let account1: string
    let account2: string

    const bootstrapSupply = ethers.utils.parseEther("1000")

    before('Deploy', async () => {
        signers = await ethers.getSigners();

        const namedAccs = await hre.getNamedAccounts()
        deployer = namedAccs.deployer

        const balancerFixture = await hre.deployments.fixture(['Balancer'])

        const SimpleTokenFactory = await ethers.getContractFactory(
            'SimpleToken',
            signers[0]
        )
        
        steak = (await SimpleTokenFactory.deploy('SimpleToken', 'SIM', ethers.utils.parseEther("5000"))) as SimpleToken

        const TenderizerFactory = await ethers.getContractFactory(
            'MockTenderizer',
            signers[0]
        )

        tenderizer = (await TenderizerFactory.deploy(steak.address, ethers.constants.AddressZero, initialSupply)) as MockTenderizer

        const TenderTokenFactory = await ethers.getContractFactory(
            'TenderToken',
            signers[0]
        )

        tenderToken = (await TenderTokenFactory.deploy('Mock', 'MCK')) as TenderToken

        const permissions = {
            canPauseSwapping: true,
            canChangeSwapFee: true,
            canChangeWeights: true,
            canAddRemoveTokens: false,
            canWhitelistLPs: false,
            canChangeCap: false
        }

        const poolParams = {
            "poolTokenSymbol": "BAL-REBASING-SMART-V1-tMCK-MCK",
            "poolTokenName": "Balancer Rebasing Smart Pool Token V1 (tMCK-MCK)",
            "constituentTokens": [
              tenderToken.address,
              steak.address
            ],
            "tokenBalances": [bootstrapSupply, bootstrapSupply],
            "tokenWeights": ["7071067811870000000", "7071067811870000000"],
            "swapFee": "3000000000000000"
          }

        const EspFactory = await ethers.getContractFactory(
            'ElasticSupplyPool',
            {
                libraries: {
                    BalancerSafeMath: balancerFixture["BalancerSafeMath"].address,
                    RightsManager: balancerFixture["RightsManager"].address,
                    SmartPoolManager: balancerFixture["SmartPoolManager"].address
                  },
                  signer: signers[0]
            }
        )

        esp = (await EspFactory.deploy(
            balancerFixture['BFactory'].address,
            poolParams,
            permissions
        )) as ElasticSupplyPool  

        const ControllerFactory = await ethers.getContractFactory(
            "Controller",
            signers[0]
        );

        account0 = await signers[0].getAddress()
        account1 = await signers[1].getAddress()
        account2 = await signers[2].getAddress()

        controller = (await ControllerFactory.deploy(steak.address, tenderizer.address, tenderToken.address, esp.address)) as Controller

        await tenderToken.transferOwnership(controller.address, {from: deployer})
        await tenderizer.transferOwnership(controller.address, {from: deployer})
        await esp.setController(deployer)

        const pcTokenSupply = '1000000000000000000000' // 1000e18
        const minimumWeightChangeBlockPeriod = 10;
        const addTokenTimeLockInBlocks = 10;
        
        await steak.approve(controller.address, bootstrapSupply)
        await controller.deposit(bootstrapSupply)

        await steak.approve(esp.address, bootstrapSupply)
        await tenderToken.approve(esp.address, bootstrapSupply)

        await esp.createPool(pcTokenSupply, minimumWeightChangeBlockPeriod, addTokenTimeLockInBlocks)
        bpoolAddr = await esp.bPool()

        await esp.setController(controller.address)
    })

    // beforeEach(async () => {
    //     snapshotId = await rpc.snapshot()
    // })
    
    // afterEach(async () => {
    //     await rpc.revert(snapshotId)
    // })

    describe('Initial state after deployment', () => {
        describe('Controller', () => {
            // TODO: Check config
        })

        describe('Tenderizer', () => {
            it('increases the steak balance of the tenderizer', async () =>  {
                expect(await steak.balanceOf(tenderizer.address)).to.eq(bootstrapSupply)
            })
        })

        describe('TenderToken', () => {
            it("increases total supply of tender token", async () => {
                expect(await tenderToken.totalSupply()).to.eq(bootstrapSupply)
            })
    
            it("increases total shares", async () => {
                expect(await tenderToken.getTotalShares()).to.eq(bootstrapSupply)
            })
        })

        describe('Liquidity Pool', () => {
            it("minted tenderToken and sent to liquidity pool", async () => {
                expect(await tenderToken.balanceOf(bpoolAddr)).to.eq(bootstrapSupply)
            })

            it("sent steak token to the liquidty pool", async () => {
                expect(await steak.balanceOf(bpoolAddr)).to.eq(bootstrapSupply)
            })

            it("mints a correct amount of shares and sent to liquidity pool", async () => {
                expect(await tenderToken.sharesOf(bpoolAddr)).to.eq(bootstrapSupply)
            })
        })
    })

    describe("Deposit", () => {

        it("reverts if amount is zero", async () => {
            await expect(controller.deposit(ethers.constants.Zero, {from: deployer})).to.be.revertedWith("ZERO_AMOUNT")
        })

        it("reverts if funds aren't approved", async () => {
            await expect(controller.deposit(ethers.constants.Two, {from: deployer})).to.be.reverted
        })

        describe("deposits funds from account1", () => {
            let totalSupplyBefore: BigNumber
            let totalSharesBefore: BigNumber
            let steakBalanceBefore: BigNumber
            let principalBefore: BigNumber

            const acc1Deposit = ethers.utils.parseEther("500")

            before(async () => {
                totalSupplyBefore = await tenderToken.totalSupply()
                totalSharesBefore = await tenderToken.getTotalShares()
                steakBalanceBefore = await steak.balanceOf(tenderizer.address)
                principalBefore = await tenderizer.currentPrincipal()

                // Send account1 some token from deployer
                await steak.transfer(account1, acc1Deposit, {from: deployer})
                await steak.connect(signers[1]).approve(controller.address, acc1Deposit, {from: account1})
                await controller.connect(signers[1]).deposit(acc1Deposit, {from: account1})
            })

            it("mints an equal balance of tender token", async () => {
                expect(await tenderToken.balanceOf(account1)).to.eq(acc1Deposit)
            })

            it("increases total supply of tender token", async () => {
                expect(await tenderToken.totalSupply()).to.eq(totalSupplyBefore.add(acc1Deposit))
            })

            it("mints a correct amount of shares", async () => {
                expect(await tenderToken.sharesOf(account1)).to.eq(acc1Deposit)
            })
    
            it("increases total shares", async () => {
                expect(await tenderToken.getTotalShares()).to.eq(totalSharesBefore.add(acc1Deposit))
            })

            it('increases the steak balance of the tenderizer', async () =>  {
                expect(await steak.balanceOf(tenderizer.address)).to.eq(steakBalanceBefore.add(acc1Deposit))
            })
        })

        describe("deposits funds from account2", () => {
            let totalSupplyBefore: BigNumber
            let totalSharesBefore: BigNumber
            let steakBalanceBefore: BigNumber
            let principalBefore: BigNumber

            const acc2Deposit = ethers.utils.parseEther("200")

            before(async () => {
                totalSupplyBefore = await tenderToken.totalSupply()
                totalSharesBefore = await tenderToken.getTotalShares()
                steakBalanceBefore = await steak.balanceOf(tenderizer.address)
                principalBefore = await tenderizer.currentPrincipal()

                // Send account1 some token from deployer
                await steak.transfer(account2, acc2Deposit, {from: deployer})
                await steak.connect(signers[2]).approve(controller.address, acc2Deposit, {from: account2})
                await controller.connect(signers[2]).deposit(acc2Deposit, {from: account2})
            })

            it("mints an equal balance of tender token", async () => {
                expect(await tenderToken.balanceOf(account2)).to.eq(acc2Deposit)
            })

            it("increases total supply of tender token", async () => {
                expect(await tenderToken.totalSupply()).to.eq(totalSupplyBefore.add(acc2Deposit))
            })

            it("mints a correct amount of shares", async () => {
                expect(await tenderToken.sharesOf(account2)).to.eq(acc2Deposit)
            })
    
            it("increases total shares", async () => {
                expect(await tenderToken.getTotalShares()).to.eq(totalSharesBefore.add(acc2Deposit))
            })

            it('increases the steak balance of the tenderizer', async () =>  {
                expect(await steak.balanceOf(tenderizer.address)).to.eq(steakBalanceBefore.add(acc2Deposit))
            })
        })

    })
    

})