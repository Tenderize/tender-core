import { constants } from 'ethers'
import { solidity } from 'ethereum-waffle'
import { ethers, deployments } from 'hardhat'

import { TenderSwap, SimpleToken } from '../../typechain'
import chai from 'chai'
import * as rpc from '../util/snapshot'

chai.use(solidity)
const { expect } = chai

describe('TenderSwap', () => {
  let snapshotId: any
  let swap: TenderSwap
  let firstToken: SimpleToken
  let secondToken: SimpleToken
  let fixture: any
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

    fixture = await deployments.fixture('TenderSwap')
    swap = await ethers.getContractAt('TenderSwap', fixture.TenderSwap.address) as TenderSwap
  })

  describe('Initialize', () => {
    it('Reverts with zero address token0', async () => {
      await expect(
        swap.initialize(
          constants.AddressZero,
          secondToken.address,
          LP_TOKEN_NAME,
          LP_TOKEN_SYMBOL,
          INITIAL_A_VALUE,
          SWAP_FEE,
          0,
          fixture.LiquidityPoolToken.address
        )
      ).to.be.revertedWith('TOKEN0_ZEROADDRESS')
    })

    it('Reverts with zero address token1', async () => {
      await expect(
        swap.initialize(
          firstToken.address,
          constants.AddressZero,
          LP_TOKEN_NAME,
          LP_TOKEN_SYMBOL,
          INITIAL_A_VALUE,
          SWAP_FEE,
          0,
          fixture.LiquidityPoolToken.address
        )
      ).to.be.revertedWith('TOKEN1_ZEROADDRESS')
    })

    it("Reverts with 'Duplicate tokens'", async () => {
      await expect(
        swap.initialize(
          firstToken.address,
          firstToken.address,
          LP_TOKEN_NAME,
          LP_TOKEN_SYMBOL,
          INITIAL_A_VALUE,
          SWAP_FEE,
          0,
          fixture.LiquidityPoolToken.address
        )
      ).to.be.revertedWith('DUPLICATE_TOKENS')
    })

    it("Reverts with '_a exceeds maximum'", async () => {
      await expect(
        swap.initialize(
          firstToken.address,
          secondToken.address,
          LP_TOKEN_NAME,
          LP_TOKEN_SYMBOL,
          10e6 + 1,
          SWAP_FEE,
          0,
          fixture.LiquidityPoolToken.address
        )
      ).to.be.revertedWith('_a exceeds maximum')
    })

    it("Reverts with '_fee exceeds maximum'", async () => {
      await expect(
        swap.initialize(
          firstToken.address,
          secondToken.address,
          LP_TOKEN_NAME,
          LP_TOKEN_SYMBOL,
          INITIAL_A_VALUE,
          10e8 + 1,
          0,
          fixture.LiquidityPoolToken.address
        )
      ).to.be.revertedWith('_fee exceeds maximum')
    })

    it("Reverts with '_adminFee exceeds maximum'", async () => {
      await expect(
        swap.initialize(
          firstToken.address,
          secondToken.address,
          LP_TOKEN_NAME,
          LP_TOKEN_SYMBOL,
          INITIAL_A_VALUE,
          SWAP_FEE,
          10e10 + 1,
          fixture.LiquidityPoolToken.address
        )
      ).to.be.revertedWith('_adminFee exceeds maximum')
    })

    it('Reverts when the LPToken target does not implement initialize function', async () => {
      await expect(
        swap.initialize(
          firstToken.address,
          secondToken.address,
          LP_TOKEN_NAME,
          LP_TOKEN_SYMBOL,
          INITIAL_A_VALUE,
          SWAP_FEE,
          0,
          constants.AddressZero
        )
      ).to.be.reverted
    })
  })
})
