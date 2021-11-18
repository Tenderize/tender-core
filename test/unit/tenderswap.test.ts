// TODO: virtualPrice

import { constants, Signer, BigNumber } from 'ethers'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'

import { ITenderSwap, SimpleToken, LiquidityPoolToken, TestSwapReturnValues, IERC20 } from '../../typechain'
import chai from 'chai'
import * as rpc from '../util/snapshot'
import {
  getCurrentBlockTimestamp,
  setNextTimestamp,
  setTimestamp,
  forceAdvanceOneBlock
} from '../util/evm'
import {
  asyncForEach
} from '../util/helpers'

chai.use(solidity)
const { expect } = chai

// Contract calls

async function getPoolBalances (
  swap: ITenderSwap,
  numOfTokens: number
): Promise<BigNumber[]> {
  const balances = []

  for (let i = 0; i < numOfTokens; i++) {
    balances.push(await swap.getTokenBalance(i))
  }
  return balances
}

async function getUserTokenBalances (
  address: string | Signer,
  tokens: IERC20[]
): Promise<BigNumber[]> {
  const balanceArray = []

  if (address instanceof Signer) {
    address = await address.getAddress()
  }

  for (const token of tokens) {
    balanceArray.push(await token.balanceOf(address))
  }

  return balanceArray
}

async function getUserTokenBalance (
  address: string | Signer,
  token: IERC20
): Promise<BigNumber> {
  if (address instanceof Signer) {
    address = await address.getAddress()
  }
  return token.balanceOf(address)
}

describe('TenderSwap', () => {
  let snapshotId: any
  let signers: Array<Signer>
  let swap: ITenderSwap
  let testSwapReturnValues: TestSwapReturnValues
  //   let swapUtils: SwapUtils
  let firstToken: SimpleToken
  let secondToken: SimpleToken
  let swapToken: LiquidityPoolToken
  let owner: Signer
  let user1: Signer
  let user2: Signer
  let ownerAddress: string
  let user1Address: string
  let user2Address: string

  // Test Values
  const INITIAL_A_VALUE = 50
  const SWAP_FEE = 1e7
  const LP_TOKEN_NAME = 'Test LP Token Name'
  const LP_TOKEN_SYMBOL = 'TESTLP'

  beforeEach(async () => {
    snapshotId = await rpc.snapshot()
  })

  afterEach(async () => {
    await rpc.revert(snapshotId)
  })

  beforeEach(async () => {
    signers = await ethers.getSigners()
    owner = signers[0]
    user1 = signers[1]
    user2 = signers[2]
    ownerAddress = await owner.getAddress()
    user1Address = await user1.getAddress()
    user2Address = await user2.getAddress()

    // Deploy dummy tokens
    const erc20Factory = await ethers.getContractFactory('SimpleToken')

    firstToken = (await erc20Factory.deploy(
      'First Token',
      'FIRST',
      '18'
    )) as SimpleToken

    secondToken = (await erc20Factory.deploy(
      'Second Token',
      'SECOND',
      '18'
    )) as SimpleToken

    // Mint dummy tokens
    await asyncForEach([owner, user1, user2], async (signer) => {
      const address = await signer.getAddress()
      await firstToken.mint(address, String(1e20))
      await secondToken.mint(address, String(1e20))
    })

    // deploy SwapUtils
    const swapUtils = await (await ethers.getContractFactory('SwapUtils')).deploy()

    const lpTokenFac = await ethers.getContractFactory('LiquidityPoolToken')
    const lpToken = (await lpTokenFac.deploy()) as LiquidityPoolToken

    const swapFactory = await ethers.getContractFactory('TenderSwap', {
      libraries: {
        SwapUtils: swapUtils.address
      }
    })
    swap = (await swapFactory.deploy()) as ITenderSwap

    await swap.initialize(
      firstToken.address,
      secondToken.address,
      LP_TOKEN_NAME,
      LP_TOKEN_SYMBOL,
      INITIAL_A_VALUE,
      SWAP_FEE,
      0,
      lpToken.address
    )

    swapToken = (await ethers.getContractAt('LiquidityPoolToken', await swap.lpToken())) as LiquidityPoolToken

    const testSwapReturnValuesFactory = await ethers.getContractFactory(
      'TestSwapReturnValues'
    )
    testSwapReturnValues = (await testSwapReturnValuesFactory.deploy(
      swap.address,
      swapToken.address
    )) as TestSwapReturnValues

    await asyncForEach([owner, user1, user2], async (signer) => {
      await firstToken.connect(signer).approve(swap.address, constants.MaxUint256)
      await secondToken.connect(signer).approve(swap.address, constants.MaxUint256)
      await swapToken.connect(signer).approve(swap.address, constants.MaxUint256)
    })

    await swap.addLiquidity([String(1e18), String(1e18)], 0, constants.MaxUint256)

    expect(await firstToken.balanceOf(swap.address)).to.eq(String(1e18))
    expect(await secondToken.balanceOf(swap.address)).to.eq(String(1e18))
  })

  describe('A', async () => {
    it('Returns correct A value', async () => {
      expect(await swap.getA()).to.eq(INITIAL_A_VALUE)
      expect(await swap.getAPrecise()).to.eq(INITIAL_A_VALUE * 100)
    })
  })

  describe('fee', async () => {
    it('Returns correct fee value', async () => {
      expect((await swap.feeParams()).swapFee).to.eq(SWAP_FEE)
    })
  })

  describe('adminFee', async () => {
    it('Returns correct adminFee value', async () => {
      expect((await swap.feeParams()).adminFee).to.eq(0)
    })
  })

  describe('getToken', () => {
    it('Returns correct addresses of pooled tokens', async () => {
      expect(await swap.getToken0()).to.eq(firstToken.address)
      expect(await swap.getToken1()).to.eq(secondToken.address)
    })
  })

  describe('getTokenBalance', () => {
    it('Returns correct balances of pooled tokens', async () => {
      expect(await swap.getToken0Balance()).to.eq(String(1e18))
      expect(await swap.getToken1Balance()).to.eq(String(1e18))
    })
  })

  describe('addLiquidity', () => {
    it("Reverts with 'Cannot withdraw more than available'", async () => {
      await expect(
        swap
          .connect(user1)
          .calculateTokenAmount([constants.MaxUint256, String(3e18)], false)
      ).to.be.revertedWith('AMOUNT_EXCEEDS_SUPPLY')
    })

    it('Succeeds with expected output amount of pool tokens', async () => {
      const calculatedPoolTokenAmount = await swap
        .connect(user1)
        .calculateTokenAmount([String(1e18), String(3e18)], true)

      const calculatedPoolTokenAmountWithSlippage = calculatedPoolTokenAmount
        .mul(999)
        .div(1000)

      const tx = await swap
        .connect(user1)
        .addLiquidity(
          [String(1e18), String(3e18)],
          calculatedPoolTokenAmountWithSlippage,
          constants.MaxUint256
        )

      await tx.wait()

      const actualPoolTokenAmount = await swapToken.balanceOf(user1Address)

      // The actual pool token amount is less than 4e18 due to the imbalance of the underlying tokens
      expect(actualPoolTokenAmount).to.eq(BigNumber.from('3991672211258372957'))
    })

    it('Succeeds with actual pool token amount being within ±0.1% range of calculated pool token', async () => {
      const calculatedPoolTokenAmount = await swap
        .connect(user1)
        .calculateTokenAmount([String(1e18), String(3e18)], true)

      const calculatedPoolTokenAmountWithNegativeSlippage =
        calculatedPoolTokenAmount.mul(999).div(1000)

      const calculatedPoolTokenAmountWithPositiveSlippage =
        calculatedPoolTokenAmount.mul(1001).div(1000)

      await swap
        .connect(user1)
        .addLiquidity(
          [String(1e18), String(3e18)],
          calculatedPoolTokenAmountWithNegativeSlippage,
          constants.MaxUint256
        )

      const actualPoolTokenAmount = await swapToken.balanceOf(user1Address)

      expect(actualPoolTokenAmount).to.gte(
        calculatedPoolTokenAmountWithNegativeSlippage
      )

      expect(actualPoolTokenAmount).to.lte(
        calculatedPoolTokenAmountWithPositiveSlippage
      )
    })

    it('Succeeds with correctly updated tokenBalance after imbalanced deposit', async () => {
      await swap
        .connect(user1)
        .addLiquidity([String(1e18), String(3e18)], 0, constants.MaxUint256)

      // Check updated token balance
      expect(await swap.getToken0Balance()).to.eq(BigNumber.from(String(2e18)))
      expect(await swap.getToken1Balance()).to.eq(BigNumber.from(String(4e18)))
    })

    it('Returns correct minted lpToken amount', async () => {
      await firstToken.mint(testSwapReturnValues.address, String(1e20))
      await secondToken.mint(testSwapReturnValues.address, String(1e20))

      await testSwapReturnValues.test_addLiquidity(
        [String(1e18), String(2e18)],
        0
      )
    })

    it('Reverts when minToMint is not reached due to front running', async () => {
      const calculatedLPTokenAmount = await swap
        .connect(user1)
        .calculateTokenAmount([String(1e18), String(3e18)], true)

      const calculatedLPTokenAmountWithSlippage = calculatedLPTokenAmount
        .mul(999)
        .div(1000)

      // Someone else deposits thus front running user 1's deposit
      await swap.addLiquidity([String(1e18), String(3e18)], 0, constants.MaxUint256)

      await expect(
        swap
          .connect(user1)
          .addLiquidity(
            [String(1e18), String(3e18)],
            calculatedLPTokenAmountWithSlippage,
            constants.MaxUint256
          )
      ).to.be.reverted
    })

    it('Reverts when block is mined after deadline', async () => {
      const currentTimestamp = await getCurrentBlockTimestamp()
      await setNextTimestamp(currentTimestamp + 60 * 10)

      await expect(
        swap
          .connect(user1)
          .addLiquidity(
            [String(2e18), String(1e16)],
            0,
            currentTimestamp + 60 * 5
          )
      ).to.be.revertedWith('Deadline not met')
    })

    it('Emits addLiquidity event', async () => {
      const calculatedLPTokenAmount = await swap
        .connect(user1)
        .calculateTokenAmount([String(2e18), String(1e16)], true)

      const calculatedLPTokenAmountWithSlippage = calculatedLPTokenAmount
        .mul(999)
        .div(1000)

      await expect(
        swap
          .connect(user1)
          .addLiquidity(
            [String(2e18), String(1e16)],
            calculatedLPTokenAmountWithSlippage,
            constants.MaxUint256
          )
      ).to.emit(swap.connect(user1), 'AddLiquidity')
    })
  })

  describe('removeLiquidity', () => {
    it("Reverts with 'Cannot exceed total supply'", async () => {
      await expect(
        swap.calculateRemoveLiquidity(constants.MaxUint256)
      ).to.be.revertedWith('Cannot exceed total supply')
    })

    it('Succeeds with expected return amounts of underlying tokens', async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, constants.MaxUint256)

      const [
        firstTokenBalanceBefore,
        secondTokenBalanceBefore,
        poolTokenBalanceBefore
      ] = await getUserTokenBalances(user1, [
        firstToken,
        secondToken,
        swapToken
      ])

      expect(poolTokenBalanceBefore).to.eq(
        BigNumber.from('1996275270169644725')
      )

      const [expectedFirstTokenAmount, expectedSecondTokenAmount] =
        await swap.calculateRemoveLiquidity(poolTokenBalanceBefore)

      expect(expectedFirstTokenAmount).to.eq(
        BigNumber.from('1498601924450190405')
      )
      expect(expectedSecondTokenAmount).to.eq(
        BigNumber.from('504529314564897436')
      )

      // User 1 removes liquidity
      await swapToken
        .connect(user1)
        .approve(swap.address, poolTokenBalanceBefore)
      await swap
        .connect(user1)
        .removeLiquidity(
          poolTokenBalanceBefore,
          [expectedFirstTokenAmount, expectedSecondTokenAmount],
          constants.MaxUint256
        )

      const [firstTokenBalanceAfter, secondTokenBalanceAfter] =
        await getUserTokenBalances(user1, [firstToken, secondToken])

      // Check the actual returned token amounts match the expected amounts
      expect(firstTokenBalanceAfter.sub(firstTokenBalanceBefore)).to.eq(
        expectedFirstTokenAmount
      )
      expect(secondTokenBalanceAfter.sub(secondTokenBalanceBefore)).to.eq(
        expectedSecondTokenAmount
      )
    })

    it('Returns correct amounts of received tokens', async () => {
      await firstToken.mint(testSwapReturnValues.address, String(1e20))
      await secondToken.mint(testSwapReturnValues.address, String(1e20))

      await testSwapReturnValues.test_addLiquidity(
        [String(1e18), String(2e18)],
        0
      )
      const tokenBalance = await swapToken.balanceOf(
        testSwapReturnValues.address
      )

      await testSwapReturnValues.test_removeLiquidity(tokenBalance, [0, 0])
    })

    it('Reverts when user tries to burn more LP tokens than they own', async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, constants.MaxUint256)
      const currentUser1Balance = await swapToken.balanceOf(user1Address)
      expect(currentUser1Balance).to.eq(BigNumber.from('1996275270169644725'))

      await expect(
        swap
          .connect(user1)
          .removeLiquidity(
            currentUser1Balance.add(1),
            [constants.MaxUint256, constants.MaxUint256],
            constants.MaxUint256
          )
      ).to.be.reverted
    })

    it('Reverts when minAmounts of underlying tokens are not reached due to front running', async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, constants.MaxUint256)
      const currentUser1Balance = await swapToken.balanceOf(user1Address)
      expect(currentUser1Balance).to.eq(BigNumber.from('1996275270169644725'))

      const [expectedFirstTokenAmount, expectedSecondTokenAmount] =
        await swap.calculateRemoveLiquidity(currentUser1Balance)

      expect(expectedFirstTokenAmount).to.eq(
        BigNumber.from('1498601924450190405')
      )
      expect(expectedSecondTokenAmount).to.eq(
        BigNumber.from('504529314564897436')
      )

      // User 2 adds liquidity, which leads to change in balance of underlying tokens
      await swap
        .connect(user2)
        .addLiquidity([String(1e16), String(2e18)], 0, constants.MaxUint256)

      // User 1 tries to remove liquidity which get reverted due to front running
      await swapToken.connect(user1).approve(swap.address, currentUser1Balance)
      await expect(
        swap
          .connect(user1)
          .removeLiquidity(
            currentUser1Balance,
            [expectedFirstTokenAmount, expectedSecondTokenAmount],
            constants.MaxUint256
          )
      ).to.be.reverted
    })

    it('Reverts when block is mined after deadline', async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, constants.MaxUint256)
      const currentUser1Balance = await swapToken.balanceOf(user1Address)

      const currentTimestamp = await getCurrentBlockTimestamp()
      await setNextTimestamp(currentTimestamp + 60 * 10)

      // User 1 tries removing liquidity with deadline of +5 minutes
      await swapToken.connect(user1).approve(swap.address, currentUser1Balance)
      await expect(
        swap
          .connect(user1)
          .removeLiquidity(
            currentUser1Balance,
            [0, 0],
            currentTimestamp + 60 * 5
          )
      ).to.be.revertedWith('Deadline not met')
    })

    it('Emits removeLiquidity event', async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, constants.MaxUint256)
      const currentUser1Balance = await swapToken.balanceOf(user1Address)

      // User 1 tries removes liquidity
      await swapToken.connect(user1).approve(swap.address, currentUser1Balance)
      await expect(
        swap
          .connect(user1)
          .removeLiquidity(currentUser1Balance, [0, 0], constants.MaxUint256)
      ).to.emit(swap.connect(user1), 'RemoveLiquidity')
    })
  })

  describe('removeLiquidityOneToken', () => {
    it("Reverts with 'Withdraw exceeds available'", async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, constants.MaxUint256)
      const currentUser1Balance = await swapToken.balanceOf(user1Address)
      expect(currentUser1Balance).to.eq(BigNumber.from('1996275270169644725'))

      await expect(
        swap.calculateRemoveLiquidityOneToken(currentUser1Balance.mul(2), firstToken.address)
      ).to.be.revertedWith('AMOUNT_EXCEEDS_AVAILABLE')
    })

    it('Succeeds with calculated token amount as minAmount', async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, constants.MaxUint256)
      const currentUser1Balance = await swapToken.balanceOf(user1Address)
      expect(currentUser1Balance).to.eq(BigNumber.from('1996275270169644725'))

      // User 1 calculates the amount of underlying token to receive.
      const calculatedFirstTokenAmount =
        await swap.calculateRemoveLiquidityOneToken(currentUser1Balance, firstToken.address)
      expect(calculatedFirstTokenAmount).to.eq(
        BigNumber.from('2992749992078990271')
      )

      // User 1 initiates one token withdrawal
      const before = await firstToken.balanceOf(user1Address)
      swapToken.connect(user1).approve(swap.address, currentUser1Balance)
      await swap
        .connect(user1)
        .removeLiquidityOneToken(
          currentUser1Balance,
          firstToken.address,
          calculatedFirstTokenAmount,
          constants.MaxUint256
        )
      const after = await firstToken.balanceOf(user1Address)

      expect(after.sub(before)).to.eq(BigNumber.from('2992749992078990271'))
    })

    it('Returns correct amount of received token', async () => {
      await firstToken.mint(testSwapReturnValues.address, String(1e20))
      await secondToken.mint(testSwapReturnValues.address, String(1e20))
      await testSwapReturnValues.test_addLiquidity(
        [String(1e18), String(2e18)],
        0
      )
      await testSwapReturnValues.test_removeLiquidityOneToken(
        String(2e18),
        firstToken.address,
        0
      )
    })

    it('Reverts when user tries to burn more LP tokens than they own', async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, constants.MaxUint256)
      const currentUser1Balance = await swapToken.balanceOf(user1Address)
      expect(currentUser1Balance).to.eq(BigNumber.from('1996275270169644725'))

      await expect(
        swap
          .connect(user1)
          .removeLiquidityOneToken(
            currentUser1Balance.add(1),
            firstToken.address,
            0,
            constants.MaxUint256
          )
      ).to.be.reverted
    })

    it('Reverts when minAmount of underlying token is not reached due to front running', async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, constants.MaxUint256)
      const currentUser1Balance = await swapToken.balanceOf(user1Address)
      expect(currentUser1Balance).to.eq(BigNumber.from('1996275270169644725'))

      // User 1 calculates the amount of underlying token to receive.
      const calculatedFirstTokenAmount =
        await swap.calculateRemoveLiquidityOneToken(currentUser1Balance, firstToken.address)
      expect(calculatedFirstTokenAmount).to.eq(
        BigNumber.from('2992749992078990271')
      )

      // User 2 adds liquidity before User 1 initiates withdrawal
      await swap
        .connect(user2)
        .addLiquidity([String(1e16), String(1e20)], 0, constants.MaxUint256)

      // User 1 initiates one token withdrawal
      swapToken.connect(user1).approve(swap.address, currentUser1Balance)
      await expect(
        swap
          .connect(user1)
          .removeLiquidityOneToken(
            currentUser1Balance,
            firstToken.address,
            calculatedFirstTokenAmount,
            constants.MaxUint256
          )
      ).to.be.reverted
    })

    it('Reverts when block is mined after deadline', async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, constants.MaxUint256)
      const currentUser1Balance = await swapToken.balanceOf(user1Address)

      const currentTimestamp = await getCurrentBlockTimestamp()
      await setNextTimestamp(currentTimestamp + 60 * 10)

      // User 1 tries removing liquidity with deadline of +5 minutes
      await swapToken.connect(user1).approve(swap.address, currentUser1Balance)
      await expect(
        swap
          .connect(user1)
          .removeLiquidityOneToken(
            currentUser1Balance,
            firstToken.address,
            0,
            currentTimestamp + 60 * 5
          )
      ).to.be.revertedWith('Deadline not met')
    })

    it('Emits RemoveLiquidityOne event', async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, constants.MaxUint256)
      const currentUser1Balance = await swapToken.balanceOf(user1Address)

      await swapToken.connect(user1).approve(swap.address, currentUser1Balance)
      await expect(
        swap
          .connect(user1)
          .removeLiquidityOneToken(currentUser1Balance, firstToken.address, 0, constants.MaxUint256)
      ).to.emit(swap.connect(user1), 'RemoveLiquidityOne')
    })
  })

  describe('swap', () => {
    it("Reverts with 'Cannot swap more than you own'", async () => {
      await expect(
        swap.connect(user1).swap(firstToken.address, constants.MaxUint256, 0, constants.MaxUint256)
      ).to.be.revertedWith('ERC20: transfer amount exceeds balance')
    })

    it('Succeeds with expected swap amounts', async () => {
      // User 1 calculates how much token to receive
      const calculatedSwapReturn = await swap.calculateSwap(firstToken.address, String(1e17))
      expect(calculatedSwapReturn).to.eq(BigNumber.from('99702611562565289'))

      const [tokenFromBalanceBefore, tokenToBalanceBefore] =
        await getUserTokenBalances(user1, [firstToken, secondToken])

      // User 1 successfully initiates swap
      await swap
        .connect(user1)
        .swap(firstToken.address, String(1e17), calculatedSwapReturn, constants.MaxUint256)

      // Check the sent and received amounts are as expected
      const [tokenFromBalanceAfter, tokenToBalanceAfter] =
        await getUserTokenBalances(user1, [firstToken, secondToken])
      expect(tokenFromBalanceBefore.sub(tokenFromBalanceAfter)).to.eq(
        BigNumber.from(String(1e17))
      )
      expect(tokenToBalanceAfter.sub(tokenToBalanceBefore)).to.eq(
        calculatedSwapReturn
      )
    })

    it('Reverts when minDy (minimum amount token to receive) is not reached due to front running', async () => {
      // User 1 calculates how much token to receive
      const calculatedSwapReturn = await swap.calculateSwap(firstToken.address, String(1e17))
      expect(calculatedSwapReturn).to.eq(BigNumber.from('99702611562565289'))

      // User 2 swaps before User 1 does
      await swap.connect(user2).swap(firstToken.address, String(1e17), 0, constants.MaxUint256)

      // User 1 initiates swap
      await expect(
        swap
          .connect(user1)
          .swap(firstToken.address, String(1e17), calculatedSwapReturn, constants.MaxUint256)
      ).to.be.reverted
    })

    it('Succeeds when using lower minDy even when transaction is front-ran', async () => {
      // User 1 calculates how much token to receive with 1% slippage
      const calculatedSwapReturn = await swap.calculateSwap(firstToken.address, String(1e17))
      expect(calculatedSwapReturn).to.eq(BigNumber.from('99702611562565289'))

      const [tokenFromBalanceBefore, tokenToBalanceBefore] =
        await getUserTokenBalances(user1, [firstToken, secondToken])

      const calculatedSwapReturnWithNegativeSlippage = calculatedSwapReturn
        .mul(99)
        .div(100)

      // User 2 swaps before User 1 does
      await swap.connect(user2).swap(firstToken.address, String(1e17), 0, constants.MaxUint256)

      // User 1 successfully initiates swap with 1% slippage from initial calculated amount
      await swap
        .connect(user1)
        .swap(
          firstToken.address,
          String(1e17),
          calculatedSwapReturnWithNegativeSlippage,
          constants.MaxUint256
        )

      // Check the sent and received amounts are as expected
      const [tokenFromBalanceAfter, tokenToBalanceAfter] =
        await getUserTokenBalances(user1, [firstToken, secondToken])

      expect(tokenFromBalanceBefore.sub(tokenFromBalanceAfter)).to.eq(
        BigNumber.from(String(1e17))
      )

      const actualReceivedAmount = tokenToBalanceAfter.sub(tokenToBalanceBefore)

      expect(actualReceivedAmount).to.eq(BigNumber.from('99286252365528551'))
      expect(actualReceivedAmount).to.gt(
        calculatedSwapReturnWithNegativeSlippage
      )
      expect(actualReceivedAmount).to.lt(calculatedSwapReturn)
    })

    it('Returns correct amount of received token', async () => {
      await firstToken.mint(testSwapReturnValues.address, String(1e20))
      await secondToken.mint(testSwapReturnValues.address, String(1e20))
      await testSwapReturnValues.test_addLiquidity(
        [String(1e18), String(2e18)],
        0
      )
      await testSwapReturnValues.test_swap(firstToken.address, String(1e18), 0)
    })

    it('Reverts when block is mined after deadline', async () => {
      const currentTimestamp = await getCurrentBlockTimestamp()
      await setNextTimestamp(currentTimestamp + 60 * 10)

      // User 1 tries swapping with deadline of +5 minutes
      await expect(
        swap
          .connect(user1)
          .swap(firstToken.address, String(1e17), 0, currentTimestamp + 60 * 5)
      ).to.be.revertedWith('Deadline not met')
    })

    it('Emits Swap event', async () => {
      // User 1 initiates swap
      await expect(
        swap.connect(user1).swap(firstToken.address, String(1e17), 0, constants.MaxUint256)
      ).to.emit(swap, 'Swap')
    })
  })

  describe('setSwapFee', () => {
    it('Emits NewSwapFee event', async () => {
      await expect(swap.setSwapFee(BigNumber.from(1e8))).to.emit(
        swap,
        'NewSwapFee'
      )
    })

    it('Reverts when called by non-owners', async () => {
      await expect(swap.connect(user1).setSwapFee(0)).to.be.reverted
      await expect(swap.connect(user2).setSwapFee(BigNumber.from(1e8))).to.be
        .reverted
    })

    it('Reverts when fee is higher than the limit', async () => {
      await expect(swap.setSwapFee(BigNumber.from(1e8).add(1))).to.be.reverted
    })

    it('Succeeds when fee is within the limit', async () => {
      await swap.setSwapFee(BigNumber.from(1e8))
      expect((await swap.feeParams()).swapFee).to.eq(BigNumber.from(1e8))
    })
  })

  describe('setAdminFee', () => {
    it('Emits NewAdminFee event', async () => {
      await expect(swap.setAdminFee(BigNumber.from(1e10))).to.emit(
        swap,
        'NewAdminFee'
      )
    })

    it('Reverts when called by non-owners', async () => {
      await expect(swap.connect(user1).setSwapFee(0)).to.be.reverted
      await expect(swap.connect(user2).setSwapFee(BigNumber.from(1e10))).to.be
        .reverted
    })

    it('Reverts when adminFee is higher than the limit', async () => {
      await expect(swap.setAdminFee(BigNumber.from(1e10).add(1))).to.be.reverted
    })

    it('Succeeds when adminFee is within the limit', async () => {
      await swap.setAdminFee(BigNumber.from(1e10))
      expect((await swap.feeParams()).adminFee).to.eq(BigNumber.from(1e10))
    })
  })
})
