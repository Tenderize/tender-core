import hre, { ethers } from 'hardhat'

import { MockContract, smockit } from '@eth-optimism/smock'

import {
  SimpleToken, Controller, Tenderizer, TenderToken, IMatic, EIP173Proxy, TenderFarm, TenderSwap, LiquidityPoolToken
} from '../../typechain/'

import chai from 'chai'
import {
  solidity
} from 'ethereum-waffle'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { Deployment } from 'hardhat-deploy/dist/types'
import { BigNumber } from '@ethersproject/bignumber'
import { ContractTransaction } from '@ethersproject/contracts'

import { sharesToTokens, percOf2 } from '../util/helpers'
import { getCurrentBlockTimestamp } from '../util/evm'

chai.use(solidity)
const {
  expect
} = chai

describe('Matic Integration Test', () => {
  let MaticNoMock: IMatic
  let MaticMock: MockContract
  let MaticToken: SimpleToken
  let Controller: Controller
  let Tenderizer: Tenderizer
  let TenderToken: TenderToken
  let TenderSwap: TenderSwap
  let LpToken: LiquidityPoolToken
  let TenderFarm: TenderFarm

  let Matic: {[name: string]: Deployment}

  let signers: SignerWithAddress[]
  let deployer: string

  const exchangeRatePrecision = 100
  const fxRate = 100

  let withdrawAmount: BigNumber

  let tx: ContractTransaction
  const lockID = 0
  const protocolFeesPercent = ethers.utils.parseEther('0.025')
  const liquidityFeesPercent = ethers.utils.parseEther('0.025')

  const acceptableDelta = 2

  let NODE: string

  before('get signers', async () => {
    const namedAccs = await hre.getNamedAccounts()
    signers = await ethers.getSigners()

    deployer = namedAccs.deployer
  })

  before('deploy Matic token', async () => {
    const SimpleTokenFactory = await ethers.getContractFactory(
      'SimpleToken',
      signers[0]
    )

    MaticToken = (await SimpleTokenFactory.deploy('Matic Token', 'MATIC', ethers.utils.parseEther('1000000'))) as SimpleToken
  })

  before('deploy Matic', async () => {
    const MaticFac = await ethers.getContractFactory(
      'MaticMock',
      signers[0]
    )

    MaticNoMock = (await MaticFac.deploy(MaticToken.address)) as IMatic

    MaticMock = await smockit(MaticNoMock)

    NODE = MaticMock.address
  })

  const STEAK_AMOUNT = '100000'
  const initialStake = ethers.utils.parseEther(STEAK_AMOUNT).div('2')

  const deposit = ethers.utils.parseEther('100')
  const secondDeposit = ethers.utils.parseEther('10')

  const ONE = ethers.utils.parseEther('1')

  before('deploy Matic Tenderizer', async () => {
    process.env.NAME = 'Matic'
    process.env.SYMBOL = 'MATIC'
    process.env.VALIDATOR = MaticMock.address
    process.env.TOKEN = MaticToken.address
    process.env.CONTRACT = '0x0000000000000000000000000000000000000101' // dummy
    process.env.STEAK_AMOUNT = STEAK_AMOUNT
    Matic = await hre.deployments.fixture(['Matic'], {
      keepExistingDeployments: false
    })
    Controller = (await ethers.getContractAt('Controller', Matic.Controller.address)) as Controller
    Tenderizer = (await ethers.getContractAt('Tenderizer', Matic.Matic.address)) as Tenderizer
    TenderToken = (await ethers.getContractAt('TenderToken', Matic.TenderToken.address)) as TenderToken
    TenderSwap = (await ethers.getContractAt('TenderSwap', await Controller.tenderSwap())) as TenderSwap
    TenderFarm = (await ethers.getContractAt('TenderFarm', Matic.TenderFarm.address)) as TenderFarm
    LpToken = (await ethers.getContractAt('LiquidityPoolToken', await TenderSwap.lpToken())) as LiquidityPoolToken
    TenderFarm = (await ethers.getContractAt('TenderFarm', Matic.TenderFarm.address)) as TenderFarm

    await Controller.batchExecute(
      [Tenderizer.address, Tenderizer.address],
      [0, 0],
      [Tenderizer.interface.encodeFunctionData('setProtocolFee', [protocolFeesPercent]),
        Tenderizer.interface.encodeFunctionData('setLiquidityFee', [liquidityFeesPercent])]
    )

    // Deposit initial stake
    await MaticToken.approve(Controller.address, initialStake)
    await Controller.deposit(initialStake, { gasLimit: 500000 })
    await Controller.gulp()
    // Add initial liquidity
    await MaticToken.approve(TenderSwap.address, initialStake)
    await TenderToken.approve(TenderSwap.address, initialStake)
    const lpTokensOut = await TenderSwap.calculateTokenAmount([initialStake, initialStake], true)
    await TenderSwap.addLiquidity([initialStake, initialStake], lpTokensOut, (await getCurrentBlockTimestamp()) + 1000)
    console.log('added liquidity')
    console.log('calculated', lpTokensOut.toString(), 'actual', (await LpToken.balanceOf(deployer)).toString())
    await LpToken.approve(TenderFarm.address, lpTokensOut)
    await TenderFarm.farm(lpTokensOut)
    console.log('farmed LP tokens')
  })

  describe('deposit', () => {
    it('reverts because transfer amount exceeds allowance', async () => {
      await expect(Controller.deposit(deposit)).to.be.revertedWith('ERC20: transfer amount exceeds allowance')
    })

    describe('deposits funds succesfully', async () => {
      let tx: ContractTransaction
      before(async () => {
        await MaticToken.approve(Controller.address, deposit)
        tx = await Controller.deposit(deposit)
      })

      it('increases TenderToken supply', async () => {
        expect(await TenderToken.totalSupply()).to.eq(deposit.add(initialStake))
      })

      it('increases Tenderizer principle', async () => {
        expect(await Tenderizer.currentPrincipal()).to.eq(deposit.add(initialStake))
      })

      it('increases TenderToken balance of depositor', async () => {
        expect(await TenderToken.balanceOf(deployer)).to.eq(deposit)
      })

      it('emits Deposit event from tenderizer', async () => {
        expect(tx).to.emit(Tenderizer, 'Deposit').withArgs(deployer, deposit)
      })
    })
  })

  describe('stake', () => {
    let tx: ContractTransaction
    it('bond succeeds', async () => {
      MaticMock.smocked.validatorId.will.return.with(1)
      MaticMock.smocked.exchangeRate.will.return.with(fxRate)
      MaticMock.smocked.buyVoucher.will.return()
      tx = await Controller.gulp()
      expect(MaticMock.smocked.buyVoucher.calls.length).to.eq(1)
      // A smocked contract doesn't execute its true code
      // So matic.buyVoucher() never calls ERC20.transferFrom() under the hood
      // Therefore when we call gulp() it will be for the deposit and bootstrapped supply on deployment
      // Smock doesn't support executing code
      const minSharesToMint = deposit.add(initialStake).mul(exchangeRatePrecision).div(fxRate).sub(1)
      expect(MaticMock.smocked.buyVoucher.calls[0]._amount).to.eq(deposit.add(initialStake))
      expect(MaticMock.smocked.buyVoucher.calls[0]._minSharesToMint).to.eq(minSharesToMint)
    })

    it('emits Stake event from tenderizer', async () => {
      expect(tx).to.emit(Tenderizer, 'Stake').withArgs(MaticMock.address, deposit.add(initialStake))
    })

    it('uses specified node if passed, not default', async () => {
      const newValidatorShare = await smockit(MaticNoMock)
      newValidatorShare.smocked.buyVoucher.will.return()
      const newNodeAddress = newValidatorShare.address
      const txData = Tenderizer.interface.encodeFunctionData('stake', [newNodeAddress, ethers.utils.parseEther('0')])
      await Controller.execute(Tenderizer.address, 0, txData)
      expect(MaticMock.smocked.buyVoucher.calls.length).to.eq(0)
      expect(newValidatorShare.smocked.buyVoucher.calls.length).to.eq(1)
    })

    it('uses specified amount if passed, not contract token balance', async () => {
      const amount = ethers.utils.parseEther('0.1')
      const txData = Tenderizer.interface.encodeFunctionData('stake', [ethers.constants.AddressZero, amount])
      await Controller.execute(Tenderizer.address, 0, txData)
      expect(MaticMock.smocked.buyVoucher.calls[0]._amount).to.eq(amount)
    })

    it('returns without calling buyVoucher() if no balance', async () => {
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [Tenderizer.address]
      }
      )
      const signer = await ethers.provider.getSigner(Tenderizer.address)
      await hre.network.provider.send('hardhat_setBalance', [
        Tenderizer.address,
        `0x${ethers.utils.parseEther('10')}`
      ])
      await MaticToken.connect(signer).transfer(NODE, deposit.add(initialStake))
      await hre.network.provider.request({
        method: 'hardhat_stopImpersonatingAccount',
        params: [Tenderizer.address]
      }
      )

      await Controller.gulp()
      expect(MaticMock.smocked.buyVoucher.calls.length).to.eq(0)
    })
  })

  const increase = ethers.BigNumber.from('10000000000')
  const liquidityFees = percOf2(increase, liquidityFeesPercent)
  const protocolFees = percOf2(increase, protocolFeesPercent)
  const newStake = deposit.add(initialStake).add(increase)
  const newStakeMinusFees = newStake.sub(liquidityFees.add(protocolFees))
  let dyBefore: BigNumber

  describe('rebase', () => {
    let totalShares: BigNumber

    describe('stake increased', () => {
      totalShares = ONE
      let tx: ContractTransaction

      before(async () => {
        dyBefore = await TenderSwap.calculateSwap(TenderToken.address, ONE)
        totalShares = await TenderToken.getTotalShares()
        MaticMock.smocked.balanceOf.will.return.with(newStake)
        MaticMock.smocked.exchangeRate.will.return.with(fxRate)
        tx = await Controller.rebase()
      })

      it('updates currentPrincipal', async () => {
        expect(await Tenderizer.currentPrincipal()).to.eq(newStakeMinusFees)
      })

      it('increases tendertoken balances when rewards are added', async () => {
        // account 0
        const shares = await TenderToken.sharesOf(deployer)
        totalShares = await TenderToken.getTotalShares()
        expect(await TenderToken.balanceOf(deployer)).to.eq(sharesToTokens(shares, totalShares, newStakeMinusFees))
      })
      it('increases the tenderToken balance of the AMM', async () => {
        const shares = await TenderToken.sharesOf(TenderSwap.address)
        expect(await TenderToken.balanceOf(TenderSwap.address)).to.eq(sharesToTokens(shares, totalShares, await TenderToken.totalSupply()))
      })

      it('steak balance stays the same', async () => {
        expect(await MaticToken.balanceOf(TenderSwap.address)).to.eq(initialStake)
      })

      it('tenderToken price slightly decreases vs underlying', async () => {
        expect(await TenderSwap.calculateSwap(TenderToken.address, ONE)).to.be.lt(dyBefore)
      })

      it('should emit RewardsClaimed event from Tenderizer', async () => {
        expect(tx).to.emit(Tenderizer, 'RewardsClaimed').withArgs(increase, newStakeMinusFees, deposit.add(initialStake))
      })
    })

    describe('stake stays the same', () => {
      let feesBefore: BigNumber
      before(async () => {
        feesBefore = await Tenderizer.pendingFees()
        await Controller.rebase()
      })

      it('currentPrincipal increases by swappedLPTRewards', async () => {
        expect(await Tenderizer.currentPrincipal()).to.eq(newStakeMinusFees)
      })

      it('pending fees stay the same', async () => {
        expect(await Tenderizer.pendingFees()).to.eq(feesBefore)
      })
    })

    describe('stake decrease', () => {
      // The decrease will offset the increase from the previous test
      const newStake = deposit.add(initialStake)
      let totalShares: BigNumber
      let oldPrinciple: BigNumber

      let feesBefore: BigNumber = ethers.constants.Zero
      let tx: ContractTransaction
      let dyBefore: BigNumber

      // calculate stake before rebase - fees
      const oldStake = deposit.add(initialStake)
      const expectedCP = oldStake.sub(liquidityFees).sub(protocolFees)

      before(async () => {
        dyBefore = await TenderSwap.calculateSwap(TenderToken.address, ONE)
        feesBefore = await Tenderizer.pendingFees()
        MaticMock.smocked.balanceOf.will.return.with(newStake)
        MaticMock.smocked.exchangeRate.will.return.with(fxRate)
        oldPrinciple = await Tenderizer.currentPrincipal()
        tx = await Controller.rebase()
      })

      it('updates currentPrincipal', async () => {
        expect(await Tenderizer.currentPrincipal()).to.eq(expectedCP)
      })

      it('decreases tendertoken balances when slashed', async () => {
        // account 0
        const shares = await TenderToken.sharesOf(deployer)
        totalShares = await TenderToken.getTotalShares()
        expect(await TenderToken.balanceOf(deployer)).to.eq(sharesToTokens(shares, totalShares, await TenderToken.totalSupply()))
      })

      it("doesn't increase pending fees", async () => {
        expect(await Tenderizer.pendingFees()).to.eq(feesBefore)
      })

      it('decreases the tenderToken balance of the AMM', async () => {
        const shares = await TenderToken.sharesOf(TenderSwap.address)
        expect(await TenderToken.balanceOf(TenderSwap.address)).to.eq(sharesToTokens(shares, totalShares, expectedCP))
      })

      it('steak balance stays the same', async () => {
        expect(await MaticToken.balanceOf(TenderSwap.address)).to.eq(initialStake)
      })

      it('price of the TenderTokens increases vs the underlying', async () => {
        expect(await TenderSwap.calculateSwap(MaticToken.address, ONE)).to.be.gt(dyBefore)
      })

      it('should emit RewardsClaimed event from Tenderizer with 0 rewards and currentPrinciple', async () => {
        expect(tx).to.emit(Tenderizer, 'RewardsClaimed').withArgs('0', expectedCP, oldPrinciple)
      })
    })
  })

  describe('collect fees', () => {
    let fees: BigNumber
    let ownerBalBefore: BigNumber
    let tx: ContractTransaction
    let otherAccBalBefore: BigNumber

    before(async () => {
      fees = await Tenderizer.pendingFees()
      ownerBalBefore = await TenderToken.balanceOf(deployer)
      otherAccBalBefore = await TenderToken.balanceOf(signers[2].address)
      tx = await Controller.collectFees()
      await tx.wait()
    })

    it('should reset pendingFees', async () => {
      expect(await Tenderizer.pendingFees()).to.eq(ethers.constants.Zero)
    })

    it('should increase tenderToken balance of owner', async () => {
      const newBalance = await TenderToken.balanceOf(deployer)
      const acceptableDelta = ethers.BigNumber.from('10')

      expect(newBalance.sub(ownerBalBefore.add(fees)).abs()).to.be.lte(acceptableDelta)
    })

    it('should not change balance of other account', async () => {
      expect(await TenderToken.balanceOf(signers[2].address)).to.eq(otherAccBalBefore)
    })

    it('should emit ProtocolFeeCollected event from Tenderizer', async () => {
      expect(tx).to.emit(Tenderizer, 'ProtocolFeeCollected').withArgs(fees)
    })
  })

  describe('collect liquidity fees', () => {
    let fees: BigNumber
    let farmBalanceBefore: BigNumber
    let acc0BalBefore: BigNumber

    before(async () => {
      fees = await Tenderizer.pendingLiquidityFees()
      farmBalanceBefore = await TenderToken.balanceOf(TenderFarm.address)
      acc0BalBefore = await TenderToken.balanceOf(deployer)
      tx = await Controller.collectLiquidityFees()
    })

    it('should reset pendingFees', async () => {
      expect(await Tenderizer.pendingLiquidityFees()).to.eq(ethers.constants.Zero)
    })

    it('should increase tenderToken balance of tenderFarm', async () => {
      expect((await TenderToken.balanceOf(TenderFarm.address)).sub(farmBalanceBefore.add(fees))).to.lte(acceptableDelta)
    })

    it('should not change balance of other account', async () => {
      expect(await TenderToken.balanceOf(deployer)).to.eq(acc0BalBefore)
    })

    it('should emit ProtocolFeeCollected event from Tenderizer', async () => {
      expect(tx).to.emit(Tenderizer, 'LiquidityFeeCollected').withArgs(fees)
    })
  })

  describe('swap against TenderSwap', () => {
    it('swaps tenderToken for Token', async () => {
      const amount = deposit.div(2)
      const balBefore = await MaticToken.balanceOf(deployer)

      const dy = await TenderSwap.calculateSwap(TenderToken.address, amount)
      await TenderToken.approve(TenderSwap.address, amount)
      await TenderSwap.swap(
        TenderToken.address,
        amount,
        dy,
        (await getCurrentBlockTimestamp()) + 1000
      )

      const lptBalAfter = await MaticToken.balanceOf(deployer)
      expect(lptBalAfter.sub(balBefore)).to.eq(dy)
    })
  })

  describe('unlock', () => {
    before('stake with another account', async () => {
      await MaticToken.transfer(signers[2].address, secondDeposit)
      await MaticToken.connect(signers[2]).approve(Controller.address, secondDeposit)
      await Controller.connect(signers[2]).deposit(secondDeposit)
    })

    it('reverts if unbond() reverts', async () => {
      MaticMock.smocked.sellVoucher_new.will.revert()
      await expect(Controller.unlock(withdrawAmount)).to.be.reverted
    })

    it('reverts if requested amount exceeds balance', async () => {
      MaticMock.smocked.sellVoucher_new.will.return()
      withdrawAmount = await TenderToken.balanceOf(deployer)
      await expect(Controller.unlock(withdrawAmount.add(ONE))).to.be.revertedWith('BURN_AMOUNT_EXCEEDS_BALANCE')
    })

    it('reverts if requested amount is 0', async () => {
      await expect(Controller.unlock(ethers.constants.Zero)).to.be.revertedWith('ZERO_AMOUNT')
    })

    it('sellVoucher() succeeds', async () => {
      tx = await Controller.unlock(withdrawAmount)
      const maxSharesToBurn = withdrawAmount.mul(exchangeRatePrecision).div(fxRate).add(1)
      expect(MaticMock.smocked.sellVoucher_new.calls.length).to.eq(1)
      expect(MaticMock.smocked.sellVoucher_new.calls[0]._claimAmount).to.eq(withdrawAmount)
      expect(MaticMock.smocked.sellVoucher_new.calls[0]._maximumSharesToBurn).to.eq(maxSharesToBurn)
    })

    it('reduces TenderToken Balance', async () => {
      // lte to account for any roundoff error in tokenToShare calcualtion during burn
      expect(await TenderToken.balanceOf(deployer)).to.lte(acceptableDelta)
    })

    it('TenderToken balance of other account stays the same', async () => {
      const balOtherAcc = await TenderToken.balanceOf(signers[2].address)
      expect(balOtherAcc.sub(secondDeposit).abs()).to.lte(acceptableDelta)
    })

    it('should create unstakeLock', async () => {
      const lock = await Tenderizer.unstakeLocks(lockID)
      expect(lock.account).to.eq(deployer)
      expect(lock.amount).to.eq(withdrawAmount)
    })

    it('should emit Unstake event from Tenderizer', async () => {
      expect(tx).to.emit(Tenderizer, 'Unstake').withArgs(deployer, NODE, withdrawAmount, lockID)
    })

    describe('Gov unbond', async () => {
      it('Gov unbond() reverts if no pending stake', async () => {
        const txData = Tenderizer.interface.encodeFunctionData('unstake', [Controller.address, ethers.utils.parseEther('0')])
        MaticMock.smocked.balanceOf.will.return.with(0)
        MaticMock.smocked.exchangeRate.will.return.with(fxRate)
        await expect(Controller.execute(Tenderizer.address, 0, txData)).to.be.revertedWith('ZERO_STAKE')
      })

      describe('Gov partial(half) unbond', async () => {
        let govWithdrawAmount: BigNumber
        let poolBalBefore: BigNumber
        let otherAccBalBefore: BigNumber
        before('perform partial unbond', async () => {
          poolBalBefore = await TenderToken.balanceOf(TenderSwap.address)
          otherAccBalBefore = await TenderToken.balanceOf(signers[2].address)
          const totalStaked = await Tenderizer.totalStakedTokens()
          govWithdrawAmount = totalStaked.div(2)
          const txData = Tenderizer.interface.encodeFunctionData('unstake', [Controller.address, govWithdrawAmount])
          MaticMock.smocked.balanceOf.will.return.with(totalStaked)
          MaticMock.smocked.exchangeRate.will.return.with(fxRate)
          await Controller.execute(Tenderizer.address, 0, txData)
        })

        it('Gov sellVoucher_new() succeeds', async () => {
          expect(MaticMock.smocked.sellVoucher_new.calls.length).to.eq(1)
          expect(MaticMock.smocked.sellVoucher_new.calls[0]._claimAmount).to.eq(govWithdrawAmount)
        })

        it('TenderToken balance of other account halves', async () => {
          expect(await TenderToken.balanceOf(signers[2].address)).to.eq(otherAccBalBefore.div(2))
        })

        it('TenderToken balance of TenderSwap account halves', async () => {
          // Accpetable delta of 30 gwei
          expect((await TenderToken.balanceOf(TenderSwap.address)).sub(poolBalBefore.div(2)).abs())
            .to.lte(acceptableDelta * 15)
        })
      })

      describe('Gov full sellVoucher_new', async () => {
        let govWithdrawAmount: BigNumber
        before('perform full unbond', async () => {
          const txData = Tenderizer.interface.encodeFunctionData('unstake', [Controller.address, ethers.utils.parseEther('0')])
          govWithdrawAmount = (await Tenderizer.totalStakedTokens())
          MaticMock.smocked.balanceOf.will.return.with(govWithdrawAmount)
          MaticMock.smocked.exchangeRate.will.return.with(fxRate)
          await Controller.execute(Tenderizer.address, 0, txData)
        })

        it('Gov sellVoucher_new() succeeds', async () => {
          expect(MaticMock.smocked.sellVoucher_new.calls.length).to.eq(1)
          expect(MaticMock.smocked.sellVoucher_new.calls[0]._claimAmount).to.eq(govWithdrawAmount)
        })

        it('TenderToken balance of other account becomes 0', async () => {
          expect(await TenderToken.balanceOf(signers[2].address)).to.eq(0)
        })

        it('TenderToken balance of TenderSwap account becomes 0', async () => {
          expect(await TenderToken.balanceOf(TenderSwap.address)).to.eq(0)
        })
      })
    })
  })

  describe('withdraw', () => {
    let matBalBefore : BigNumber

    it('reverts if wihtdraw() reverts', async () => {
      MaticMock.smocked.unstakeClaimTokens_new.will.revert()
      await expect(Controller.withdraw(lockID)).to.be.reverted
    })

    it('withdraw() succeeds', async () => {
      MaticMock.smocked.unstakeClaimTokens_new.will.return()
      // Smocked doesn't actually execute transactions, so balance of Controller is not updated
      // hence manually transferring some tokens to simlaute withdrawal
      await MaticToken.transfer(Tenderizer.address, withdrawAmount.mul(2))

      matBalBefore = await MaticToken.balanceOf(deployer)

      tx = await Controller.withdraw(lockID)
      expect(MaticMock.smocked.unstakeClaimTokens_new.calls.length).to.eq(1)
    })

    it('increases LPT balance', async () => {
      expect(await MaticToken.balanceOf(deployer)).to.eq(matBalBefore.add(withdrawAmount))
    })

    it('should delete unstakeLock', async () => {
      const lock = await Tenderizer.unstakeLocks(lockID)
      expect(lock.account).to.eq(ethers.constants.AddressZero)
      expect(lock.amount).to.eq(0)
    })

    it('should emit Withdraw event from Tenderizer', async () => {
      expect(tx).to.emit(Tenderizer, 'Withdraw').withArgs(deployer, withdrawAmount, lockID)
    })
  })

  describe('upgrade', () => {
    let proxy: EIP173Proxy
    let newTenderizer:any
    let beforeBalance: BigNumber
    before(async () => {
      proxy = (await ethers.getContractAt('EIP173Proxy', Matic.Matic_Proxy.address)) as EIP173Proxy
      beforeBalance = await Tenderizer.currentPrincipal()
      const newFac = await ethers.getContractFactory('Matic', signers[0])
      newTenderizer = await newFac.deploy()
    })

    it('upgrade tenderizer', async () => {
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [Controller.address]
      }
      )

      const signer = await ethers.provider.getSigner(Controller.address)

      await hre.network.provider.send('hardhat_setBalance', [
        Controller.address,
        `0x${ethers.utils.parseEther('10')}`
      ])

      expect(await proxy.connect(signer).upgradeTo(newTenderizer.address)).to.emit(
        proxy,
        'ProxyImplementationUpdated'
      ).withArgs(Matic.Matic_Implementation.address, newTenderizer.address)

      await hre.network.provider.request({
        method: 'hardhat_stopImpersonatingAccount',
        params: [Controller.address]
      }
      )
    })

    it('current principal still matches', async () => {
      const newPrincipal = await Tenderizer.currentPrincipal()
      expect(newPrincipal).to.equal(beforeBalance)
    })
  })

  describe('Setting contract variables', async () => {
    describe('setting node', async () => {
      it('reverts if Zero address is set', async () => {
        const txData = Tenderizer.interface.encodeFunctionData('setNode', [ethers.constants.AddressZero])
        await expect(Controller.execute(Tenderizer.address, 0, txData)).to.be.revertedWith('ZERO_ADDRESS')
      })

      it('reverts if not called by controller', async () => {
        await expect(Tenderizer.setNode(ethers.constants.AddressZero)).to.be.reverted
      })

      it('sets node successfully', async () => {
        const newNodeAddress = '0xd944a0F8C64D292a94C34e85d9038395e3762751'
        const txData = Tenderizer.interface.encodeFunctionData('setNode', [newNodeAddress])
        tx = await Controller.execute(Tenderizer.address, 0, txData)
        expect(await Tenderizer.node()).to.equal(newNodeAddress)
      })

      it('should emit GovernanceUpdate event', async () => {
        expect(tx).to.emit(Tenderizer, 'GovernanceUpdate').withArgs('NODE')
      })
    })

    describe('setting steak', async () => {
      it('reverts if Zero address is set', async () => {
        const txData = Tenderizer.interface.encodeFunctionData('setSteak', [ethers.constants.AddressZero])
        await expect(Controller.execute(Tenderizer.address, 0, txData)).to.be.revertedWith('ZERO_ADDRESS')
      })

      it('sets steak successfully', async () => {
        const newSteakAddress = '0xd944a0F8C64D292a94C34e85d9038395e3762751'
        const txData = Tenderizer.interface.encodeFunctionData('setSteak', [newSteakAddress])
        tx = await Controller.execute(Tenderizer.address, 0, txData)
        expect(await Tenderizer.steak()).to.equal(newSteakAddress)
      })

      it('should emit GovernanceUpdate event', async () => {
        expect(tx).to.emit(Tenderizer, 'GovernanceUpdate').withArgs('STEAK')
      })
    })

    describe('setting protocol fee', async () => {
      it('sets protocol fee', async () => {
        const newFee = ethers.utils.parseEther('0.05') // 5%
        const txData = Tenderizer.interface.encodeFunctionData('setProtocolFee', [newFee])
        tx = await Controller.execute(Tenderizer.address, 0, txData)
        expect(await Tenderizer.protocolFee()).to.equal(newFee)
      })

      it('should emit GovernanceUpdate event', async () => {
        expect(tx).to.emit(Tenderizer, 'GovernanceUpdate').withArgs('PROTOCOL_FEE')
      })
    })

    describe('setting liquidity fee', async () => {
      it('sets liquidity fee', async () => {
        const newFee = ethers.utils.parseEther('0.05') // 5%
        const txData = Tenderizer.interface.encodeFunctionData('setLiquidityFee', [newFee])
        tx = await Controller.execute(Tenderizer.address, 0, txData)
        expect(await Tenderizer.liquidityFee()).to.equal(newFee)
      })

      it('should emit GovernanceUpdate event', async () => {
        expect(tx).to.emit(Tenderizer, 'GovernanceUpdate').withArgs('LIQUIDITY_FEE')
      })
    })

    describe('setting controller', async () => {
      it('reverts if Zero address is set', async () => {
        const txData = Tenderizer.interface.encodeFunctionData('setController', [ethers.constants.AddressZero])
        await expect(Controller.execute(Tenderizer.address, 0, txData)).to.be.revertedWith('ZERO_ADDRESS')
      })

      it('sets controller successfully', async () => {
        const newControllerAddress = '0xd944a0F8C64D292a94C34e85d9038395e3762751'
        const txData = Tenderizer.interface.encodeFunctionData('setController', [newControllerAddress])
        tx = await Controller.execute(Tenderizer.address, 0, txData)
        expect(await Tenderizer.controller()).to.equal(newControllerAddress)
      })

      it('should emit GovernanceUpdate event', async () => {
        expect(tx).to.emit(Tenderizer, 'GovernanceUpdate').withArgs('CONTROLLER')
      })
    })
  })
})
