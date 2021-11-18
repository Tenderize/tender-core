// // TODO: virtualPrice

// import { constants, Signer, BigNumber } from 'ethers'
// import { solidity } from 'ethereum-waffle'
// import { ethers } from 'hardhat'

// import { ITenderSwap, SimpleToken, LiquidityPoolToken, TestSwapReturnValues, IERC20 } from '../../../typechain'
// import chai from 'chai'
// import * as rpc from '../../util/snapshot'
// import {
//   getCurrentBlockTimestamp,
//   setNextTimestamp,
//   setTimestamp,
//   forceAdvanceOneBlock
// } from '../../util/evm'
// import {
//   asyncForEach
// } from '../../util/helpers'

// chai.use(solidity)
// const { expect } = chai

// // Contract calls

// async function getPoolBalances (
//   swap: ITenderSwap,
//   numOfTokens: number
// ): Promise<BigNumber[]> {
//   const balances = []

//   for (let i = 0; i < numOfTokens; i++) {
//     balances.push(await swap.getTokenBalance(i))
//   }
//   return balances
// }

// async function getUserTokenBalances (
//   address: string | Signer,
//   tokens: IERC20[]
// ): Promise<BigNumber[]> {
//   const balanceArray = []

//   if (address instanceof Signer) {
//     address = await address.getAddress()
//   }

//   for (const token of tokens) {
//     balanceArray.push(await token.balanceOf(address))
//   }

//   return balanceArray
// }

// async function getUserTokenBalance (
//   address: string | Signer,
//   token: IERC20
// ): Promise<BigNumber> {
//   if (address instanceof Signer) {
//     address = await address.getAddress()
//   }
//   return token.balanceOf(address)
// }

// describe('TenderSwap', () => {
//   let snapshotId: any
//   let signers: Array<Signer>
//   let swap: ITenderSwap
//   let testSwapReturnValues: TestSwapReturnValues
//   //   let swapUtils: SwapUtils
//   let firstToken: SimpleToken
//   let secondToken: SimpleToken
//   let swapToken: LiquidityPoolToken
//   let owner: Signer
//   let user1: Signer
//   let user2: Signer
//   let ownerAddress: string
//   let user1Address: string
//   let user2Address: string

//   // Test Values
//   const INITIAL_A_VALUE = 50
//   const SWAP_FEE = 1e7
//   const LP_TOKEN_NAME = 'Test LP Token Name'
//   const LP_TOKEN_SYMBOL = 'TESTLP'

//   beforeEach(async () => {
//     snapshotId = await rpc.snapshot()
//   })

//   afterEach(async () => {
//     await rpc.revert(snapshotId)
//   })

//   beforeEach(async () => {
//     signers = await ethers.getSigners()
//     owner = signers[0]
//     user1 = signers[1]
//     user2 = signers[2]
//     ownerAddress = await owner.getAddress()
//     user1Address = await user1.getAddress()
//     user2Address = await user2.getAddress()

//     // Deploy dummy tokens
//     const erc20Factory = await ethers.getContractFactory('SimpleToken')

//     firstToken = (await erc20Factory.deploy(
//       'First Token',
//       'FIRST',
//       '18'
//     )) as SimpleToken

//     secondToken = (await erc20Factory.deploy(
//       'Second Token',
//       'SECOND',
//       '18'
//     )) as SimpleToken

//     // Mint dummy tokens
//     await asyncForEach([owner, user1, user2], async (signer) => {
//       const address = await signer.getAddress()
//       await firstToken.mint(address, String(1e20))
//       await secondToken.mint(address, String(1e20))
//     })

//     // deploy SwapUtils
//     const swapUtils = await (await ethers.getContractFactory('SwapUtils')).deploy()

//     const lpTokenFac = await ethers.getContractFactory('LiquidityPoolToken')
//     const lpToken = (await lpTokenFac.deploy()) as LiquidityPoolToken

//     const swapFactory = await ethers.getContractFactory('TenderSwap', {
//       libraries: {
//         SwapUtils: swapUtils.address
//       }
//     })
//     swap = (await swapFactory.deploy()) as ITenderSwap

//     await swap.initialize(
//       firstToken.address,
//       secondToken.address,
//       LP_TOKEN_NAME,
//       LP_TOKEN_SYMBOL,
//       INITIAL_A_VALUE,
//       SWAP_FEE,
//       0,
//       lpToken.address
//     )

//     swapToken = (await ethers.getContractAt('LiquidityPoolToken', await swap.lpToken())) as LiquidityPoolToken

//     const testSwapReturnValuesFactory = await ethers.getContractFactory(
//       'TestSwapReturnValues'
//     )
//     testSwapReturnValues = (await testSwapReturnValuesFactory.deploy(
//       swap.address,
//       swapToken.address
//     )) as TestSwapReturnValues

//     await asyncForEach([owner, user1, user2], async (signer) => {
//       await firstToken.connect(signer).approve(swap.address, constants.MaxUint256)
//       await secondToken.connect(signer).approve(swap.address, constants.MaxUint256)
//       await swapToken.connect(signer).approve(swap.address, constants.MaxUint256)
//     })

//     await swap.addLiquidity([String(1e18), String(1e18)], 0, constants.MaxUint256)

//     expect(await firstToken.balanceOf(swap.address)).to.eq(String(1e18))
//     expect(await secondToken.balanceOf(swap.address)).to.eq(String(1e18))
//   })

//   describe('A', async () => {
//     it('Returns correct A value', async () => {
//       expect(await swap.getA()).to.eq(INITIAL_A_VALUE)
//       expect(await swap.getAPrecise()).to.eq(INITIAL_A_VALUE * 100)
//     })
//   })

//   describe('rampA', () => {
//     beforeEach(async () => {
//       await forceAdvanceOneBlock()
//     })

//     it('Emits RampA event', async () => {
//       await expect(
//         swap.rampA(
//           100,
//           (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1
//         )
//       ).to.emit(swap, 'RampA')
//     })

//     it('Succeeds to ramp upwards', async () => {
//       // Create imbalanced pool to measure virtual price change
//       // We expect virtual price to increase as A decreases
//       await swap.addLiquidity([String(1e18), 0], 0, constants.MaxUint256)

//       // call rampA(), changing A to 100 within a span of 14 days
//       const endTimestamp =
//         (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1
//       await swap.rampA(100, endTimestamp)

//       // +0 seconds since ramp A
//       expect(await swap.getA()).to.be.eq(50)
//       expect(await swap.getAPrecise()).to.be.eq(5000)
//       expect(await swap.getVirtualPrice()).to.be.eq('1000167146429977312')

//       // set timestamp to +100000 seconds
//       await setTimestamp((await getCurrentBlockTimestamp()) + 100000)
//       expect(await swap.getA()).to.be.eq(54)
//       expect(await swap.getAPrecise()).to.be.eq(5413)
//       expect(await swap.getVirtualPrice()).to.be.eq('1000258443200231295')

//       // set timestamp to the end of ramp period
//       await setTimestamp(endTimestamp)
//       expect(await swap.getA()).to.be.eq(100)
//       expect(await swap.getAPrecise()).to.be.eq(10000)
//       expect(await swap.getVirtualPrice()).to.be.eq('1000771363829405068')
//     })

//     it('Succeeds to ramp downwards', async () => {
//       // Create imbalanced pool to measure virtual price change
//       // We expect virtual price to decrease as A decreases
//       await swap.addLiquidity([String(1e18), 0], 0, constants.MaxUint256)

//       // call rampA()
//       const endTimestamp =
//         (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1
//       await swap.rampA(25, endTimestamp)

//       // +0 seconds since ramp A
//       expect(await swap.getA()).to.be.eq(50)
//       expect(await swap.getAPrecise()).to.be.eq(5000)
//       expect(await swap.getVirtualPrice()).to.be.eq('1000167146429977312')

//       // set timestamp to +100000 seconds
//       await setTimestamp((await getCurrentBlockTimestamp()) + 100000)
//       expect(await swap.getA()).to.be.eq(47)
//       expect(await swap.getAPrecise()).to.be.eq(4794)
//       expect(await swap.getVirtualPrice()).to.be.eq('1000115870150391894')

//       // set timestamp to the end of ramp period
//       await setTimestamp(endTimestamp)
//       expect(await swap.getA()).to.be.eq(25)
//       expect(await swap.getAPrecise()).to.be.eq(2500)
//       expect(await swap.getVirtualPrice()).to.be.eq('998999574522335473')
//     })

//     it('Reverts when non-owner calls it', async () => {
//       await expect(
//         swap
//           .connect(user1)
//           .rampA(55, (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1)
//       ).to.be.reverted
//     })

//     it("Reverts with 'Wait 1 day before starting ramp'", async () => {
//       await swap.rampA(
//         55,
//         (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1
//       )
//       await expect(
//         swap.rampA(55, (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1)
//       ).to.be.revertedWith('Wait 1 day before starting ramp')
//     })

//     it("Reverts with 'Insufficient ramp time'", async () => {
//       await expect(
//         swap.rampA(55, (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS - 1)
//       ).to.be.revertedWith('Insufficient ramp time')
//     })

//     it("Reverts with 'futureA_ must be > 0 and < MAX_A'", async () => {
//       await expect(
//         swap.rampA(0, (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1)
//       ).to.be.revertedWith('futureA_ must be > 0 and < MAX_A')
//     })

//     it("Reverts with 'futureA_ is too small'", async () => {
//       await expect(
//         swap.rampA(24, (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1)
//       ).to.be.revertedWith('futureA_ is too small')
//     })

//     it("Reverts with 'futureA_ is too large'", async () => {
//       await expect(
//         swap.rampA(
//           101,
//           (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1
//         )
//       ).to.be.revertedWith('futureA_ is too large')
//     })
//   })

//   describe('stopRampA', () => {
//     it('Emits StopRampA event', async () => {
//       // call rampA()
//       await swap.rampA(
//         100,
//         (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 100
//       )

//       // Stop ramp
//       expect(swap.stopRampA()).to.emit(swap, 'StopRampA')
//     })

//     it('Stop ramp succeeds', async () => {
//       // call rampA()
//       const endTimestamp =
//         (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 100
//       await swap.rampA(100, endTimestamp)

//       // set timestamp to +100000 seconds
//       await setTimestamp((await getCurrentBlockTimestamp()) + 100000)
//       expect(await swap.getA()).to.be.eq(54)
//       expect(await swap.getAPrecise()).to.be.eq(5413)

//       // Stop ramp
//       await swap.stopRampA()
//       expect(await swap.getA()).to.be.eq(54)
//       expect(await swap.getAPrecise()).to.be.eq(5413)

//       // set timestamp to endTimestamp
//       await setTimestamp(endTimestamp)

//       // verify ramp has stopped
//       expect(await swap.getA()).to.be.eq(54)
//       expect(await swap.getAPrecise()).to.be.eq(5413)
//     })

//     it("Reverts with 'Ramp is already stopped'", async () => {
//       // call rampA()
//       const endTimestamp =
//         (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 100
//       await swap.rampA(100, endTimestamp)

//       // set timestamp to +10000 seconds
//       await setTimestamp((await getCurrentBlockTimestamp()) + 100000)
//       expect(await swap.getA()).to.be.eq(54)
//       expect(await swap.getAPrecise()).to.be.eq(5413)

//       // Stop ramp
//       await swap.stopRampA()
//       expect(await swap.getA()).to.be.eq(54)
//       expect(await swap.getAPrecise()).to.be.eq(5413)

//       // check call reverts when ramp is already stopped
//       await expect(swap.stopRampA()).to.be.revertedWith(
//         'Ramp is already stopped'
//       )
//     })
//   })

//   describe('Check for timestamp manipulations', () => {
//     beforeEach(async () => {
//       await forceAdvanceOneBlock()
//     })

//     it('Check for maximum differences in A and virtual price when A is increasing', async () => {
//       // Create imbalanced pool to measure virtual price change
//       // Sets the pool in 2:1 ratio where firstToken is significantly cheaper than secondToken
//       await swap.addLiquidity([String(1e18), 0], 0, constants.MaxUint256)

//       // Initial A and virtual price
//       expect(await swap.getA()).to.be.eq(50)
//       expect(await swap.getAPrecise()).to.be.eq(5000)
//       expect(await swap.getVirtualPrice()).to.be.eq('1000167146429977312')

//       // Start ramp
//       await swap.rampA(
//         100,
//         (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1
//       )

//       // Malicious miner skips 900 seconds
//       await setTimestamp((await getCurrentBlockTimestamp()) + 900)

//       expect(await swap.getA()).to.be.eq(50)
//       expect(await swap.getAPrecise()).to.be.eq(5003)
//       expect(await swap.getVirtualPrice()).to.be.eq('1000167862696363286')

//       // Max increase of A between two blocks
//       // 5003 / 5000
//       // = 1.0006

//       // Max increase of virtual price between two blocks (at 2:1 ratio of tokens, starting A = 50)
//       // 1000167862696363286 / 1000167146429977312
//       // = 1.00000071615
//     })

//     it('Check for maximum differences in A and virtual price when A is decreasing', async () => {
//       // Create imbalanced pool to measure virtual price change
//       // Sets the pool in 2:1 ratio where firstToken is significantly cheaper than secondToken
//       await swap.addLiquidity([String(1e18), 0], 0, constants.MaxUint256)

//       // Initial A and virtual price
//       expect(await swap.getA()).to.be.eq(50)
//       expect(await swap.getAPrecise()).to.be.eq(5000)
//       expect(await swap.getVirtualPrice()).to.be.eq('1000167146429977312')

//       // Start ramp
//       await swap.rampA(
//         25,
//         (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1
//       )

//       // Malicious miner skips 900 seconds
//       await setTimestamp((await getCurrentBlockTimestamp()) + 900)

//       expect(await swap.getA()).to.be.eq(49)
//       expect(await swap.getAPrecise()).to.be.eq(4999)
//       expect(await swap.getVirtualPrice()).to.be.eq('1000166907487883089')

//       // Max decrease of A between two blocks
//       // 4999 / 5000
//       // = 0.9998

//       // Max decrease of virtual price between two blocks (at 2:1 ratio of tokens, starting A = 50)
//       // 1000166907487883089 / 1000167146429977312
//       // = 0.99999976109
//     })

//     // Below tests try to verify the issues found in Curve Vulnerability Report are resolved.
//     // https://medium.com/@peter_4205/curve-vulnerability-report-a1d7630140ec
//     // The two cases we are most concerned are:
//     //
//     // 1. A is ramping up, and the pool is at imbalanced state.
//     //
//     // Attacker can 'resolve' the imbalance prior to the change of A. Then try to recreate the imbalance after A has
//     // changed. Due to the price curve becoming more linear, recreating the imbalance will become a lot cheaper. Thus
//     // benefiting the attacker.
//     //
//     // 2. A is ramping down, and the pool is at balanced state
//     //
//     // Attacker can create the imbalance in token balances prior to the change of A. Then try to resolve them
//     // near 1:1 ratio. Since downward change of A will make the price curve less linear, resolving the token balances
//     // to 1:1 ratio will be cheaper. Thus benefiting the attacker
//     //
//     // For visual representation of how price curves differ based on A, please refer to Figure 1 in the above
//     // Curve Vulnerability Report.

//     describe('Check for attacks while A is ramping upwards', () => {
//       let initialAttackerBalances: BigNumber[] = []
//       let initialPoolBalances: BigNumber[] = []
//       let attacker: Signer

//       beforeEach(async () => {
//         // This attack is achieved by creating imbalance in the first block then
//         // trading in reverse direction in the second block.
//         attacker = user1

//         initialAttackerBalances = await getUserTokenBalances(attacker, [
//           firstToken,
//           secondToken
//         ])

//         expect(initialAttackerBalances[0]).to.be.eq(String(1e20))
//         expect(initialAttackerBalances[1]).to.be.eq(String(1e20))

//         // Start ramp upwards
//         await swap.rampA(
//           100,
//           (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1
//         )
//         expect(await swap.getAPrecise()).to.be.eq(5000)

//         // Check current pool balances
//         initialPoolBalances = [
//           await swap.getTokenBalance(0),
//           await swap.getTokenBalance(1)
//         ]
//         expect(initialPoolBalances[0]).to.be.eq(String(1e18))
//         expect(initialPoolBalances[1]).to.be.eq(String(1e18))
//       })

//       describe(
//         'When tokens are priced equally: ' +
//           'attacker creates massive imbalance prior to A change, and resolves it after',
//         () => {
//           it('Attack fails with 900 seconds between blocks', async () => {
//             // Swap 1e18 of firstToken to secondToken, causing massive imbalance in the pool
//             await swap
//               .connect(attacker)
//               .swap(0, 1, String(1e18), 0, constants.MaxUint256)
//             const secondTokenOutput = (
//               await getUserTokenBalance(attacker, secondToken)
//             ).sub(initialAttackerBalances[1])

//             // First trade results in 9.085e17 of secondToken
//             expect(secondTokenOutput).to.be.eq('908591742545002306')

//             // Pool is imbalanced! Now trades from secondToken -> firstToken may be profitable in small sizes
//             // firstToken balance in the pool  : 2.00e18
//             // secondToken balance in the pool : 9.14e16
//             expect(await swap.getTokenBalance(0)).to.be.eq(String(2e18))
//             expect(await swap.getTokenBalance(1)).to.be.eq('91408257454997694')

//             // Malicious miner skips 900 seconds
//             await setTimestamp((await getCurrentBlockTimestamp()) + 900)

//             // Verify A has changed upwards
//             // 5000 -> 5003 (0.06%)
//             expect(await swap.getAPrecise()).to.be.eq(5003)

//             // Trade secondToken to firstToken, taking advantage of the imbalance and change of A
//             const balanceBefore = await getUserTokenBalance(
//               attacker,
//               firstToken
//             )
//             await swap
//               .connect(attacker)
//               .swap(1, 0, secondTokenOutput, 0, constants.MaxUint256)
//             const firstTokenOutput = (
//               await getUserTokenBalance(attacker, firstToken)
//             ).sub(balanceBefore)

//             // If firstTokenOutput > 1e18, the malicious user leaves with more firstToken than the start.
//             expect(firstTokenOutput).to.be.eq('997214696574405737')

//             const finalAttackerBalances = await getUserTokenBalances(attacker, [
//               firstToken,
//               secondToken
//             ])

//             expect(finalAttackerBalances[0]).to.be.lt(
//               initialAttackerBalances[0]
//             )
//             expect(finalAttackerBalances[1]).to.be.eq(
//               initialAttackerBalances[1]
//             )
//             expect(
//               initialAttackerBalances[0].sub(finalAttackerBalances[0])
//             ).to.be.eq('2785303425594263')
//             expect(
//               initialAttackerBalances[1].sub(finalAttackerBalances[1])
//             ).to.be.eq('0')
//             // Attacker lost 2.785e15 firstToken (0.2785% of initial deposit)

//             // Check for pool balance changes
//             const finalPoolBalances = []
//             finalPoolBalances.push(await swap.getTokenBalance(0))
//             finalPoolBalances.push(await swap.getTokenBalance(1))

//             expect(finalPoolBalances[0]).to.be.gt(initialPoolBalances[0])
//             expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1])
//             expect(finalPoolBalances[0].sub(initialPoolBalances[0])).to.be.eq(
//               '2785303425594263'
//             )
//             expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq(
//               '0'
//             )
//             // Pool (liquidity providers) gained 2.785e15 firstToken (0.2785% of firstToken balance)
//             // The attack did not benefit the attacker.
//           })

//           it('Attack fails with 2 weeks between transactions (mimics rapid A change)', async () => {
//             // This test assumes there are no other transactions during the 2 weeks period of ramping up.
//             // Purpose of this test case is to mimic rapid ramp up of A.

//             // Swap 1e18 of firstToken to secondToken, causing massive imbalance in the pool
//             await swap
//               .connect(attacker)
//               .swap(0, 1, String(1e18), 0, constants.MaxUint256)
//             const secondTokenOutput = (
//               await getUserTokenBalance(attacker, secondToken)
//             ).sub(initialAttackerBalances[1])

//             // First trade results in 9.085e17 of secondToken
//             expect(secondTokenOutput).to.be.eq('908591742545002306')

//             // Pool is imbalanced! Now trades from secondToken -> firstToken may be profitable in small sizes
//             // firstToken balance in the pool  : 2.00e18
//             // secondToken balance in the pool : 9.14e16
//             expect(await swap.getTokenBalance(0)).to.be.eq(String(2e18))
//             expect(await swap.getTokenBalance(1)).to.be.eq('91408257454997694')

//             // Assume no transactions occur during 2 weeks
//             await setTimestamp(
//               (await getCurrentBlockTimestamp()) + 2 * TIME.WEEKS
//             )

//             // Verify A has changed upwards
//             // 5000 -> 10000 (100%)
//             expect(await swap.getAPrecise()).to.be.eq(10000)

//             // Trade secondToken to firstToken, taking advantage of the imbalance and sudden change of A
//             const balanceBefore = await getUserTokenBalance(
//               attacker,
//               firstToken
//             )
//             await swap
//               .connect(attacker)
//               .swap(1, 0, secondTokenOutput, 0, constants.MaxUint256)
//             const firstTokenOutput = (
//               await getUserTokenBalance(attacker, firstToken)
//             ).sub(balanceBefore)

//             // If firstTokenOutput > 1e18, the malicious user leaves with more firstToken than the start.
//             expect(firstTokenOutput).to.be.eq('955743484403042509')

//             const finalAttackerBalances = await getUserTokenBalances(attacker, [
//               firstToken,
//               secondToken
//             ])

//             expect(finalAttackerBalances[0]).to.be.lt(
//               initialAttackerBalances[0]
//             )
//             expect(finalAttackerBalances[1]).to.be.eq(
//               initialAttackerBalances[1]
//             )
//             expect(
//               initialAttackerBalances[0].sub(finalAttackerBalances[0])
//             ).to.be.eq('44256515596957491')
//             expect(
//               initialAttackerBalances[1].sub(finalAttackerBalances[1])
//             ).to.be.eq('0')
//             // Attacker lost 4.426e16 firstToken (4.426%)

//             // Check for pool balance changes
//             const finalPoolBalances = [
//               await swap.getTokenBalance(0),
//               await swap.getTokenBalance(1)
//             ]

//             expect(finalPoolBalances[0]).to.be.gt(initialPoolBalances[0])
//             expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1])
//             expect(finalPoolBalances[0].sub(initialPoolBalances[0])).to.be.eq(
//               '44256515596957491'
//             )
//             expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq(
//               '0'
//             )
//             // Pool (liquidity providers) gained 4.426e16 firstToken (4.426% of firstToken balance of the pool)
//             // The attack did not benefit the attacker.
//           })
//         }
//       )

//       describe(
//         'When token price is unequal: ' +
//           "attacker 'resolves' the imbalance prior to A change, then recreates the imbalance.",
//         () => {
//           beforeEach(async () => {
//             // Set up pool to be imbalanced prior to the attack
//             await swap
//               .connect(user2)
//               .addLiquidity(
//                 [String(0), String(2e18)],
//                 0,
//                 (await getCurrentBlockTimestamp()) + 60
//               )

//             // Check current pool balances
//             initialPoolBalances = [
//               await swap.getTokenBalance(0),
//               await swap.getTokenBalance(1)
//             ]
//             expect(initialPoolBalances[0]).to.be.eq(String(1e18))
//             expect(initialPoolBalances[1]).to.be.eq(String(3e18))
//           })

//           it('Attack fails with 900 seconds between blocks', async () => {
//             // Swap 1e18 of firstToken to secondToken, resolving imbalance in the pool
//             await swap
//               .connect(attacker)
//               .swap(0, 1, String(1e18), 0, constants.MaxUint256)
//             const secondTokenOutput = (
//               await getUserTokenBalance(attacker, secondToken)
//             ).sub(initialAttackerBalances[1])

//             // First trade results in 1.012e18 of secondToken
//             // Because the pool was imbalanced in the beginning, this trade results in more than 1e18 secondToken
//             expect(secondTokenOutput).to.be.eq('1011933251060681353')

//             // Pool is now almost balanced!
//             // firstToken balance in the pool  : 2.000e18
//             // secondToken balance in the pool : 1.988e18
//             expect(await swap.getTokenBalance(0)).to.be.eq(String(2e18))
//             expect(await swap.getTokenBalance(1)).to.be.eq(
//               '1988066748939318647'
//             )

//             // Malicious miner skips 900 seconds
//             await setTimestamp((await getCurrentBlockTimestamp()) + 900)

//             // Verify A has changed upwards
//             // 5000 -> 5003 (0.06%)
//             expect(await swap.getAPrecise()).to.be.eq(5003)

//             // Trade secondToken to firstToken, taking advantage of the imbalance and sudden change of A
//             const balanceBefore = await getUserTokenBalance(
//               attacker,
//               firstToken
//             )
//             await swap
//               .connect(attacker)
//               .swap(1, 0, secondTokenOutput, 0, constants.MaxUint256)
//             const firstTokenOutput = (
//               await getUserTokenBalance(attacker, firstToken)
//             ).sub(balanceBefore)

//             // If firstTokenOutput > 1e18, the attacker leaves with more firstToken than the start.
//             expect(firstTokenOutput).to.be.eq('998017518949630644')

//             const finalAttackerBalances = await getUserTokenBalances(attacker, [
//               firstToken,
//               secondToken
//             ])

//             expect(finalAttackerBalances[0]).to.be.lt(
//               initialAttackerBalances[0]
//             )
//             expect(finalAttackerBalances[1]).to.be.eq(
//               initialAttackerBalances[1]
//             )
//             expect(
//               initialAttackerBalances[0].sub(finalAttackerBalances[0])
//             ).to.be.eq('1982481050369356')
//             expect(
//               initialAttackerBalances[1].sub(finalAttackerBalances[1])
//             ).to.be.eq('0')
//             // Attacker lost 1.982e15 firstToken (0.1982% of initial deposit)

//             // Check for pool balance changes
//             const finalPoolBalances = []
//             finalPoolBalances.push(await swap.getTokenBalance(0))
//             finalPoolBalances.push(await swap.getTokenBalance(1))

//             expect(finalPoolBalances[0]).to.be.gt(initialPoolBalances[0])
//             expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1])
//             expect(finalPoolBalances[0].sub(initialPoolBalances[0])).to.be.eq(
//               '1982481050369356'
//             )
//             expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq(
//               '0'
//             )
//             // Pool (liquidity providers) gained 1.982e15 firstToken (0.1982% of firstToken balance)
//             // The attack did not benefit the attacker.
//           })

//           it('Attack succeeds with 2 weeks between transactions (mimics rapid A change)', async () => {
//             // This test assumes there are no other transactions during the 2 weeks period of ramping up.
//             // Purpose of this test case is to mimic rapid ramp up of A.

//             // Swap 1e18 of firstToken to secondToken, resolving the imbalance in the pool
//             await swap
//               .connect(attacker)
//               .swap(0, 1, String(1e18), 0, constants.MaxUint256)
//             const secondTokenOutput = (
//               await getUserTokenBalance(attacker, secondToken)
//             ).sub(initialAttackerBalances[1])

//             // First trade results in 9.085e17 of secondToken
//             expect(secondTokenOutput).to.be.eq('1011933251060681353')

//             // Pool is now almost balanced!
//             // firstToken balance in the pool  : 2.000e18
//             // secondToken balance in the pool : 1.988e18
//             expect(await swap.getTokenBalance(0)).to.be.eq(String(2e18))
//             expect(await swap.getTokenBalance(1)).to.be.eq(
//               '1988066748939318647'
//             )

//             // Assume 2 weeks go by without any other transactions
//             // This mimics rapid change of A
//             await setTimestamp(
//               (await getCurrentBlockTimestamp()) + 2 * TIME.WEEKS
//             )

//             // Verify A has changed upwards
//             // 5000 -> 10000 (100%)
//             expect(await swap.getAPrecise()).to.be.eq(10000)

//             // Trade secondToken to firstToken, taking advantage of the imbalance and sudden change of A
//             const balanceBefore = await getUserTokenBalance(
//               attacker,
//               firstToken
//             )
//             await swap
//               .connect(attacker)
//               .swap(1, 0, secondTokenOutput, 0, constants.MaxUint256)
//             const firstTokenOutput = (
//               await getUserTokenBalance(attacker, firstToken)
//             ).sub(balanceBefore)

//             // If firstTokenOutput > 1e18, the malicious user leaves with more firstToken than the start.
//             expect(firstTokenOutput).to.be.eq('1004298818514364451')
//             // Attack was successful!

//             const finalAttackerBalances = await getUserTokenBalances(attacker, [
//               firstToken,
//               secondToken
//             ])

//             expect(initialAttackerBalances[0]).to.be.lt(
//               finalAttackerBalances[0]
//             )
//             expect(initialAttackerBalances[1]).to.be.eq(
//               finalAttackerBalances[1]
//             )
//             expect(
//               finalAttackerBalances[0].sub(initialAttackerBalances[0])
//             ).to.be.eq('4298818514364451')
//             expect(
//               finalAttackerBalances[1].sub(initialAttackerBalances[1])
//             ).to.be.eq('0')
//             // Attacker gained 4.430e15 firstToken (0.430%)

//             // Check for pool balance changes
//             const finalPoolBalances = [
//               await swap.getTokenBalance(0),
//               await swap.getTokenBalance(1)
//             ]

//             expect(finalPoolBalances[0]).to.be.lt(initialPoolBalances[0])
//             expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1])
//             expect(initialPoolBalances[0].sub(finalPoolBalances[0])).to.be.eq(
//               '4298818514364451'
//             )
//             expect(initialPoolBalances[1].sub(finalPoolBalances[1])).to.be.eq(
//               '0'
//             )
//             // Pool (liquidity providers) lost 4.430e15 firstToken (0.430% of firstToken balance)

//             // The attack benefited the attacker.
//             // Note that this attack is only possible when there are no swaps happening during the 2 weeks ramp period.
//           })
//         }
//       )
//     })

//     describe('Check for attacks while A is ramping downwards', () => {
//       let initialAttackerBalances: BigNumber[] = []
//       let initialPoolBalances: BigNumber[] = []
//       let attacker: Signer

//       beforeEach(async () => {
//         // Set up the downward ramp A
//         attacker = user1

//         initialAttackerBalances = await getUserTokenBalances(attacker, [
//           firstToken,
//           secondToken
//         ])

//         expect(initialAttackerBalances[0]).to.be.eq(String(1e20))
//         expect(initialAttackerBalances[1]).to.be.eq(String(1e20))

//         // Start ramp downwards
//         await swap.rampA(
//           25,
//           (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1
//         )
//         expect(await swap.getAPrecise()).to.be.eq(5000)

//         // Check current pool balances
//         initialPoolBalances = [
//           await swap.getTokenBalance(0),
//           await swap.getTokenBalance(1)
//         ]
//         expect(initialPoolBalances[0]).to.be.eq(String(1e18))
//         expect(initialPoolBalances[1]).to.be.eq(String(1e18))
//       })

//       describe(
//         'When tokens are priced equally: ' +
//           'attacker creates massive imbalance prior to A change, and resolves it after',
//         () => {
//           // This attack is achieved by creating imbalance in the first block then
//           // trading in reverse direction in the second block.

//           it('Attack fails with 900 seconds between blocks', async () => {
//             // Swap 1e18 of firstToken to secondToken, causing massive imbalance in the pool
//             await swap
//               .connect(attacker)
//               .swap(0, 1, String(1e18), 0, constants.MaxUint256)
//             const secondTokenOutput = (
//               await getUserTokenBalance(attacker, secondToken)
//             ).sub(initialAttackerBalances[1])

//             // First trade results in 9.085e17 of secondToken
//             expect(secondTokenOutput).to.be.eq('908591742545002306')

//             // Pool is imbalanced! Now trades from secondToken -> firstToken may be profitable in small sizes
//             // firstToken balance in the pool  : 2.00e18
//             // secondToken balance in the pool : 9.14e16
//             expect(await swap.getTokenBalance(0)).to.be.eq(String(2e18))
//             expect(await swap.getTokenBalance(1)).to.be.eq('91408257454997694')

//             // Malicious miner skips 900 seconds
//             await setTimestamp((await getCurrentBlockTimestamp()) + 900)

//             // Verify A has changed downwards
//             expect(await swap.getAPrecise()).to.be.eq(4999)

//             const balanceBefore = await getUserTokenBalance(
//               attacker,
//               firstToken
//             )
//             await swap
//               .connect(attacker)
//               .swap(1, 0, secondTokenOutput, 0, constants.MaxUint256)
//             const firstTokenOutput = (
//               await getUserTokenBalance(attacker, firstToken)
//             ).sub(balanceBefore)

//             // If firstTokenOutput > 1e18, the malicious user leaves with more firstToken than the start.
//             expect(firstTokenOutput).to.be.eq('997276754500361021')

//             const finalAttackerBalances = await getUserTokenBalances(attacker, [
//               firstToken,
//               secondToken
//             ])

//             // Check for attacker's balance changes
//             expect(finalAttackerBalances[0]).to.be.lt(
//               initialAttackerBalances[0]
//             )
//             expect(finalAttackerBalances[1]).to.be.eq(
//               initialAttackerBalances[1]
//             )
//             expect(
//               initialAttackerBalances[0].sub(finalAttackerBalances[0])
//             ).to.be.eq('2723245499638979')
//             expect(
//               initialAttackerBalances[1].sub(finalAttackerBalances[1])
//             ).to.be.eq('0')
//             // Attacker lost 2.723e15 firstToken (0.2723% of initial deposit)

//             // Check for pool balance changes
//             const finalPoolBalances = [
//               await swap.getTokenBalance(0),
//               await swap.getTokenBalance(1)
//             ]

//             expect(finalPoolBalances[0]).to.be.gt(initialPoolBalances[0])
//             expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1])
//             expect(finalPoolBalances[0].sub(initialPoolBalances[0])).to.be.eq(
//               '2723245499638979'
//             )
//             expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq(
//               '0'
//             )
//             // Pool (liquidity providers) gained 2.723e15 firstToken (0.2723% of firstToken balance)
//             // The attack did not benefit the attacker.
//           })

//           it('Attack succeeds with 2 weeks between transactions (mimics rapid A change)', async () => {
//             // This test assumes there are no other transactions during the 2 weeks period of ramping down.
//             // Purpose of this test is to show how dangerous rapid A ramp is.

//             // Swap 1e18 of firstToken to secondToken, causing massive imbalance in the pool
//             await swap
//               .connect(attacker)
//               .swap(0, 1, String(1e18), 0, constants.MaxUint256)
//             const secondTokenOutput = (
//               await getUserTokenBalance(attacker, secondToken)
//             ).sub(initialAttackerBalances[1])

//             // First trade results in 9.085e17 of secondToken
//             expect(secondTokenOutput).to.be.eq('908591742545002306')

//             // Pool is imbalanced! Now trades from secondToken -> firstToken may be profitable in small sizes
//             // firstToken balance in the pool  : 2.00e18
//             // secondToken balance in the pool : 9.14e16
//             expect(await swap.getTokenBalance(0)).to.be.eq(String(2e18))
//             expect(await swap.getTokenBalance(1)).to.be.eq('91408257454997694')

//             // Assume no transactions occur during 2 weeks ramp time
//             await setTimestamp(
//               (await getCurrentBlockTimestamp()) + 2 * TIME.WEEKS
//             )

//             // Verify A has changed downwards
//             expect(await swap.getAPrecise()).to.be.eq(2500)

//             const balanceBefore = await getUserTokenBalance(
//               attacker,
//               firstToken
//             )
//             await swap
//               .connect(attacker)
//               .swap(1, 0, secondTokenOutput, 0, constants.MaxUint256)
//             const firstTokenOutput = (
//               await getUserTokenBalance(attacker, firstToken)
//             ).sub(balanceBefore)

//             // If firstTokenOutput > 1e18, the malicious user leaves with more firstToken than the start.
//             expect(firstTokenOutput).to.be.eq('1066252480054180588')

//             const finalAttackerBalances = await getUserTokenBalances(attacker, [
//               firstToken,
//               secondToken
//             ])

//             // Check for attacker's balance changes
//             expect(finalAttackerBalances[0]).to.be.gt(
//               initialAttackerBalances[0]
//             )
//             expect(finalAttackerBalances[1]).to.be.eq(
//               initialAttackerBalances[1]
//             )
//             expect(
//               finalAttackerBalances[0].sub(initialAttackerBalances[0])
//             ).to.be.eq('66252480054180588')
//             expect(
//               finalAttackerBalances[1].sub(initialAttackerBalances[1])
//             ).to.be.eq('0')
//             // Attacker gained 6.625e16 firstToken (6.625% of initial deposit)

//             // Check for pool balance changes
//             const finalPoolBalances = [
//               await swap.getTokenBalance(0),
//               await swap.getTokenBalance(1)
//             ]

//             expect(finalPoolBalances[0]).to.be.lt(initialPoolBalances[0])
//             expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1])
//             expect(initialPoolBalances[0].sub(finalPoolBalances[0])).to.be.eq(
//               '66252480054180588'
//             )
//             expect(initialPoolBalances[1].sub(finalPoolBalances[1])).to.be.eq(
//               '0'
//             )
//             // Pool (liquidity providers) lost 6.625e16 firstToken (6.625% of firstToken balance)

//             // The attack was successful. The change of A (-50%) gave the attacker a chance to swap
//             // more efficiently. The swap fee (0.1%) was not sufficient to counter the efficient trade, giving
//             // the attacker more tokens than initial deposit.
//           })
//         }
//       )

//       describe(
//         'When token price is unequal: ' +
//           "attacker 'resolves' the imbalance prior to A change, then recreates the imbalance.",
//         () => {
//           beforeEach(async () => {
//             // Set up pool to be imbalanced prior to the attack
//             await swap
//               .connect(user2)
//               .addLiquidity(
//                 [String(0), String(2e18)],
//                 0,
//                 (await getCurrentBlockTimestamp()) + 60
//               )

//             // Check current pool balances
//             initialPoolBalances = [
//               await swap.getTokenBalance(0),
//               await swap.getTokenBalance(1)
//             ]
//             expect(initialPoolBalances[0]).to.be.eq(String(1e18))
//             expect(initialPoolBalances[1]).to.be.eq(String(3e18))
//           })

//           it('Attack fails with 900 seconds between blocks', async () => {
//             // Swap 1e18 of firstToken to secondToken, resolving imbalance in the pool
//             await swap
//               .connect(attacker)
//               .swap(0, 1, String(1e18), 0, constants.MaxUint256)
//             const secondTokenOutput = (
//               await getUserTokenBalance(attacker, secondToken)
//             ).sub(initialAttackerBalances[1])

//             // First trade results in 1.012e18 of secondToken
//             // Because the pool was imbalanced in the beginning, this trade results in more than 1e18 secondToken
//             expect(secondTokenOutput).to.be.eq('1011933251060681353')

//             // Pool is now almost balanced!
//             // firstToken balance in the pool  : 2.000e18
//             // secondToken balance in the pool : 1.988e18
//             expect(await swap.getTokenBalance(0)).to.be.eq(String(2e18))
//             expect(await swap.getTokenBalance(1)).to.be.eq(
//               '1988066748939318647'
//             )

//             // Malicious miner skips 900 seconds
//             await setTimestamp((await getCurrentBlockTimestamp()) + 900)

//             // Verify A has changed downwards
//             expect(await swap.getAPrecise()).to.be.eq(4999)

//             const balanceBefore = await getUserTokenBalance(
//               attacker,
//               firstToken
//             )
//             await swap
//               .connect(attacker)
//               .swap(1, 0, secondTokenOutput, 0, constants.MaxUint256)
//             const firstTokenOutput = (
//               await getUserTokenBalance(attacker, firstToken)
//             ).sub(balanceBefore)

//             // If firstTokenOutput > 1e18, the malicious user leaves with more firstToken than the start.
//             expect(firstTokenOutput).to.be.eq('998007711333645455')

//             const finalAttackerBalances = await getUserTokenBalances(attacker, [
//               firstToken,
//               secondToken
//             ])

//             // Check for attacker's balance changes
//             expect(finalAttackerBalances[0]).to.be.lt(
//               initialAttackerBalances[0]
//             )
//             expect(finalAttackerBalances[1]).to.be.eq(
//               initialAttackerBalances[1]
//             )
//             expect(
//               initialAttackerBalances[0].sub(finalAttackerBalances[0])
//             ).to.be.eq('1992288666354545')
//             expect(
//               initialAttackerBalances[1].sub(finalAttackerBalances[1])
//             ).to.be.eq('0')
//             // Attacker lost 1.992e15 firstToken (0.1992% of initial deposit)

//             // Check for pool balance changes
//             const finalPoolBalances = [
//               await swap.getTokenBalance(0),
//               await swap.getTokenBalance(1)
//             ]

//             expect(finalPoolBalances[0]).to.be.gt(initialPoolBalances[0])
//             expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1])
//             expect(finalPoolBalances[0].sub(initialPoolBalances[0])).to.be.eq(
//               '1992288666354545'
//             )
//             expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq(
//               '0'
//             )
//             // Pool (liquidity providers) gained 1.992e15 firstToken (0.1992% of firstToken balance)
//             // The attack did not benefit the attacker.
//           })

//           it('Attack fails with 2 weeks between transactions (mimics rapid A change)', async () => {
//             // This test assumes there are no other transactions during the 2 weeks period of ramping down.
//             // Purpose of this test case is to mimic rapid ramp down of A.

//             // Swap 1e18 of firstToken to secondToken, resolving imbalance in the pool
//             await swap
//               .connect(attacker)
//               .swap(0, 1, String(1e18), 0, constants.MaxUint256)
//             const secondTokenOutput = (
//               await getUserTokenBalance(attacker, secondToken)
//             ).sub(initialAttackerBalances[1])

//             // First trade results in 1.012e18 of secondToken
//             // Because the pool was imbalanced in the beginning, this trade results in more than 1e18 secondToken
//             expect(secondTokenOutput).to.be.eq('1011933251060681353')

//             // Pool is now almost balanced!
//             // firstToken balance in the pool  : 2.000e18
//             // secondToken balance in the pool : 1.988e18
//             expect(await swap.getTokenBalance(0)).to.be.eq(String(2e18))
//             expect(await swap.getTokenBalance(1)).to.be.eq(
//               '1988066748939318647'
//             )

//             // Assume no other transactions occur during the 2 weeks ramp period
//             await setTimestamp(
//               (await getCurrentBlockTimestamp()) + 2 * TIME.WEEKS
//             )

//             // Verify A has changed downwards
//             expect(await swap.getAPrecise()).to.be.eq(2500)

//             const balanceBefore = await getUserTokenBalance(
//               attacker,
//               firstToken
//             )
//             await swap
//               .connect(attacker)
//               .swap(1, 0, secondTokenOutput, 0, constants.MaxUint256)
//             const firstTokenOutput = (
//               await getUserTokenBalance(attacker, firstToken)
//             ).sub(balanceBefore)

//             // If firstTokenOutput > 1e18, the malicious user leaves with more firstToken than the start.
//             expect(firstTokenOutput).to.be.eq('986318317546604072')
//             // Attack was not successful

//             const finalAttackerBalances = await getUserTokenBalances(attacker, [
//               firstToken,
//               secondToken
//             ])

//             // Check for attacker's balance changes
//             expect(finalAttackerBalances[0]).to.be.lt(
//               initialAttackerBalances[0]
//             )
//             expect(finalAttackerBalances[1]).to.be.eq(
//               initialAttackerBalances[1]
//             )
//             expect(
//               initialAttackerBalances[0].sub(finalAttackerBalances[0])
//             ).to.be.eq('13681682453395928')
//             expect(
//               initialAttackerBalances[1].sub(finalAttackerBalances[1])
//             ).to.be.eq('0')
//             // Attacker lost 1.368e16 firstToken (1.368% of initial deposit)

//             // Check for pool balance changes
//             const finalPoolBalances = [
//               await swap.getTokenBalance(0),
//               await swap.getTokenBalance(1)
//             ]

//             expect(finalPoolBalances[0]).to.be.gt(initialPoolBalances[0])
//             expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1])
//             expect(finalPoolBalances[0].sub(initialPoolBalances[0])).to.be.eq(
//               '13681682453395928'
//             )
//             expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq(
//               '0'
//             )
//             // Pool (liquidity providers) gained 1.368e16 firstToken (1.368% of firstToken balance)
//             // The attack did not benefit the attacker
//           })
//         }
//       )
//     })
//   })
// })
