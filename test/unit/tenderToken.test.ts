import hre, {
  ethers
} from 'hardhat'
import ethersTypes, { BigNumber } from 'ethers'
import chai from 'chai'
import {
  solidity
} from 'ethereum-waffle'
import {
  TenderToken
} from '../../typechain/TenderToken'

import * as rpc from '../util/snapshot'

import { sharesToTokens, tokensToShares } from '../util/helpers'
chai.use(solidity)
const {
  expect
} = chai

describe('TenderToken', () => {
  let snapshotId: any

  let tenderToken: TenderToken
  let signers: ethersTypes.Signer[]

  let account0: string
  let account1: string
  let account2: string

  beforeEach(async () => {
    snapshotId = await rpc.snapshot()
  })

  afterEach(async () => {
    await rpc.revert(snapshotId)
  })

  beforeEach('Deploy TenderToken', async () => {
    // 1
    signers = await ethers.getSigners()
    // 2
    const TokenFactory = await ethers.getContractFactory(
      'TenderToken',
      signers[0]
    )

    account0 = await signers[0].getAddress()
    account1 = await signers[1].getAddress()
    account2 = await signers[2].getAddress()

    tenderToken = (await TokenFactory.deploy('Mock', 'MCK')) as TenderToken
    await tenderToken.deployed()
  })

  describe('ERC20 methods', () => {
    it('name is correct', async () => {
      expect(await tenderToken.name()).to.eq('tender Mock')
    })

    it('symbol is correct', async () => {
      expect(await tenderToken.symbol()).to.eq('tMCK')
    })

    it('decimals is correct', async () => {
      expect(await tenderToken.decimals()).to.eq(18)
    })

    describe('Test initial state with zero supply', async () => {
      it('initial total supply is correct', async () => {
        expect(await tenderToken.totalSupply()).to.eq(ethers.utils.parseEther('0'))
      })

      it('initial balances are correct', async () => {
        expect(await tenderToken.balanceOf(await signers[0].getAddress())).to.eq(ethers.utils.parseEther('0'))
        expect(await tenderToken.balanceOf(await signers[1].getAddress())).to.eq(ethers.utils.parseEther('0'))
        expect(await tenderToken.balanceOf(await signers[2].getAddress())).to.eq(ethers.utils.parseEther('0'))
      })

      it('initial allowances are correct', async () => {
        expect(await tenderToken.allowance(
          await signers[0].getAddress(),
          await signers[1].getAddress()
        )).to.eq(ethers.utils.parseEther('0'))
        expect(await tenderToken.allowance(
          await signers[0].getAddress(),
          await signers[2].getAddress()
        )).to.eq(ethers.utils.parseEther('0'))
        expect(await tenderToken.allowance(
          await signers[1].getAddress(),
          await signers[2].getAddress()
        )).to.eq(ethers.utils.parseEther('0'))
        expect(await tenderToken.allowance(
          await signers[1].getAddress(),
          await signers[0].getAddress()
        )).to.eq(ethers.utils.parseEther('0'))
        expect(await tenderToken.allowance(
          await signers[2].getAddress(),
          await signers[0].getAddress()
        )).to.eq(ethers.utils.parseEther('0'))
        expect(await tenderToken.allowance(
          await signers[2].getAddress(),
          await signers[1].getAddress()
        )).to.eq(ethers.utils.parseEther('0'))
      })

      it('approve works', async () => {
        const from = await signers[0].getAddress()
        const to = await signers[1].getAddress()
        const amount = ethers.utils.parseEther('1')

        expect(await tenderToken.approve(to, amount))
          .to.emit(tenderToken, 'Approval').withArgs(from, to, amount)

        expect(
          await tenderToken.allowance(from, to)
        ).to.eq(
          amount
        )
      })

      it('transfers works with no pooled tokens, balances aren\'t changed', async () => {
        const from = await signers[0].getAddress()
        const to = await signers[1].getAddress()
        const amount = ethers.utils.parseEther('1')

        expect(await tenderToken.transfer(to, amount))
          .to.emit(tenderToken, 'Transfer').withArgs(from, to, amount)

        expect(await tenderToken.balanceOf(to)).to.eq(ethers.utils.parseEther('0'))
      })

      it('balances aren\'t changed even if total pooled ether increased', async () => {
        const amount = ethers.utils.parseEther('1')
        const to = await signers[1].getAddress()
        await tenderToken.setTotalPooledTokens(amount)

        expect(await tenderToken.totalSupply()).to.eq(amount)
        expect(await tenderToken.balanceOf(to)).to.eq(ethers.constants.Zero)
      })
    })

    describe('with non-zero supply', async () => {
      const initialAmount = ethers.utils.parseEther('100')

      beforeEach(async () => {
        await tenderToken.mint(account0, initialAmount)
      })

      afterEach(async () => {
        await hre.network.provider.request({
          method: 'hardhat_reset'
        })
      })

      it('total supply is correct', async () => {
        expect(await tenderToken.totalSupply()).to.eq(initialAmount)
      })

      it('balances are correct', async () => {
        expect(await tenderToken.balanceOf(account0)).to.eq(initialAmount)
        const zero = ethers.utils.parseEther('0')
        expect(await tenderToken.balanceOf(account1)).to.eq(zero)
        expect(await tenderToken.balanceOf(account2)).to.eq(zero)
      })

      describe('transfer', async () => {
        it('reverts when recipient is the zero address', async () => {
          const transferAmount = ethers.utils.parseEther('1')
          await expect(tenderToken.transfer(ethers.constants.AddressZero, transferAmount))
            .to.be.revertedWith('TRANSFER_TO_THE_ZERO_ADDRESS')
        })

        it('reverts when the sender does not have enough balance', async () => {
          const transferAmount = ethers.utils.parseEther('1')
          await expect(tenderToken.connect(signers[1]).transfer(account0, transferAmount))
            .to.be.revertedWith('TRANSFER_AMOUNT_EXCEEDS_BALANCE')
          await expect(tenderToken.connect(signers[2]).transfer(account0, transferAmount))
            .to.be.revertedWith('TRANSFER_AMOUNT_EXCEEDS_BALANCE')
          await expect(tenderToken.transfer(account1, initialAmount.add(transferAmount)))
            .to.be.revertedWith('TRANSFER_AMOUNT_EXCEEDS_BALANCE')
        })

        it('transfer zero tokens works and emits event', async () => {
          const zero = ethers.utils.parseEther('0')

          await expect(tenderToken.connect(signers[1]).transfer(account0, zero))
            .to.emit(tenderToken, 'Transfer').withArgs(account1, account0, zero)
          expect(await tenderToken.balanceOf(account1)).to.eq(zero)
          expect(await tenderToken.balanceOf(account0)).to.eq(initialAmount)
        })

        it('transfer partial balance works and emits event', async () => {
          const transferAmount = ethers.utils.parseEther('20')

          await expect(tenderToken.transfer(account1, transferAmount))
            .to.emit(tenderToken, 'Transfer').withArgs(account0, account1, transferAmount)
          expect(await tenderToken.balanceOf(account1)).to.eq(transferAmount)
          expect(await tenderToken.balanceOf(account0)).to.eq(initialAmount.sub(transferAmount))
        })

        it('transfer all balance works and emits event', async () => {
          const zero = ethers.utils.parseEther('0')

          await expect(tenderToken.transfer(account2, initialAmount))
            .to.emit(tenderToken, 'Transfer').withArgs(account0, account2, initialAmount)
          expect(await tenderToken.balanceOf(account2)).to.eq(initialAmount)
          expect(await tenderToken.balanceOf(account0)).to.eq(zero)
        })
      })

      describe('approve', async () => {
        it('reverts when spender is zero address', async () => {
          const transferAmount = ethers.utils.parseEther('20')
          await expect(tenderToken.approve(ethers.constants.AddressZero, transferAmount)).to.be.revertedWith('APPROVE_TO_ZERO_ADDRESS')
        })

        it('approve without any tokens works', async () => {
          const transferAmount = ethers.utils.parseEther('20')
          await expect(tenderToken.connect(signers[1]).approve(account0, transferAmount))
            .to.emit(tenderToken, 'Approval').withArgs(account1, account0, transferAmount)
          expect(await tenderToken.allowance(account1, account0)).to.eq(transferAmount)
        })

        it('when the spender had no approved amount before', () => {
          it('approve requested amount works and emits event', async () => {
            const transferAmount = ethers.utils.parseEther('20')

            await expect(tenderToken.approve(account1, transferAmount))
              .to.emit(tenderToken, 'Approval')
              .withArgs(account0, account1, transferAmount)
            expect(await tenderToken.allowance(account0, account1)).to.eq(transferAmount)

            await expect(tenderToken.approve(account2, transferAmount))
              .to.emit(tenderToken, 'Approval')
              .withArgs(account0, account2, transferAmount)
            expect(await tenderToken.allowance(account0, account2)).to.eq(transferAmount)
          })

          it('when the spender had an approved amount', () => {
            it('replace old allowance and emit event', async () => {
              const transferAmount = ethers.utils.parseEther('50')

              await expect(tenderToken.approve(account1, transferAmount))
                .to.emit(tenderToken, 'Approval')
                .withArgs(account0, account1, transferAmount)
              expect(await tenderToken.allowance(account0, account1)).to.eq(transferAmount)

              await expect(tenderToken.approve(account2, transferAmount))
                .to.emit(tenderToken, 'Approval')
                .withArgs(account0, account2, transferAmount)
              expect(await tenderToken.allowance(account0, account2)).to.eq(transferAmount)
            })
          })
        })
      })

      describe('transferFrom', async () => {
        const transferAmount = ethers.utils.parseEther('50')

        beforeEach(async () => {
          await tenderToken.approve(account1, transferAmount)
          await tenderToken.connect(signers[1]).approve(account2, transferAmount) // account1 has no tokens
        })

        afterEach(async () => {
          await hre.network.provider.request({
            method: 'hardhat_reset'
          })
        })

        it('reverts when recipient is zero address', async () => {
          await expect(tenderToken.connect(signers[1]).transferFrom(account0, ethers.constants.AddressZero, transferAmount))
            .to.be.revertedWith('TRANSFER_TO_THE_ZERO_ADDRESS')
        })

        it('reverts when amount exceeds allowance', async () => {
          await expect(tenderToken.connect(signers[1]).transferFrom(account0, account1, transferAmount.mul(ethers.constants.Two)))
            .to.be.revertedWith('TRANSFER_AMOUNT_EXCEEDS_ALLOWANCE')
        })

        it('transferFrom works and emits events', async () => {
          await expect(tenderToken.connect(signers[1]).transferFrom(account0, account1, transferAmount))
            .to.emit(tenderToken, 'Transfer').withArgs(account0, account1, transferAmount)

          expect(await tenderToken.allowance(account0, account1)).to.eq(ethers.constants.Zero)
          expect(await tenderToken.balanceOf(account0)).to.eq(transferAmount)
          expect(await tenderToken.balanceOf(account1)).to.eq(transferAmount)
          expect(await tenderToken.balanceOf(account2)).to.eq(ethers.constants.Zero)
        })
      })

      describe('increase allowance', () => {
        const transferAmount = ethers.utils.parseEther('50')

        it('reverts when spender is zero address', async () => {
          await expect(tenderToken.increaseAllowance(ethers.constants.AddressZero, transferAmount))
            .to.be.revertedWith('APPROVE_TO_ZERO_ADDRESS')
        })

        it('increaseAllowance without any tokens works', async () => {
          const transferAmount = ethers.utils.parseEther('0')

          await expect(tenderToken.connect(signers[2]).increaseAllowance(account1, transferAmount))
            .to.emit(tenderToken, 'Approval')
            .withArgs(account2, account1, transferAmount)

          expect(await tenderToken.allowance(account2, account1)).to.eq(transferAmount)
        })

        it('when the spender had no approved amount before', () => {
          it('increaseAllowance with requested amount works and emits event', async () => {
            await expect(tenderToken.connect(signers[1]).increaseAllowance(account2, ethers.constants.Zero))
              .to.emit(tenderToken, 'Approval')
              .withArgs(account1, account2, ethers.constants.Zero)

            expect(await tenderToken.allowance(account2, account1)).to.eq(ethers.constants.Zero)
          })
        })

        it('when the spender had an approved amount', () => {
          it('increaseAllowance with requested amount adds it to allowance and emits event', async () => {
            await tenderToken.approve(account1, transferAmount)
            const totalAmount = transferAmount.mul(ethers.constants.Two)
            await expect(tenderToken.increaseAllowance(account1, transferAmount))
              .to.emit(tenderToken, 'Approval')
              .withArgs(account0, account1, totalAmount)

            expect(await tenderToken.allowance(account0, account1)).to.eq(totalAmount)
          })
        })
      })

      describe('decrease allowance', () => {
        const transferAmount = ethers.utils.parseEther('50')

        beforeEach(async () => {
          await tenderToken.approve(account1, transferAmount)
          await tenderToken.connect(signers[2]).approve(account1, transferAmount) // account2 has no tokens
        })

        it('reverts when requested amount exceeds allowance ', async () => {
          await expect(tenderToken.decreaseAllowance(account1, transferAmount.mul(ethers.constants.Two)))
            .to.be.revertedWith('DECREASED_ALLOWANCE_BELOW_ZERO')
        })

        it('reverts when the spender had no approved amount', async () => {
          await expect(tenderToken.decreaseAllowance(account2, transferAmount))
            .to.be.revertedWith('DECREASED_ALLOWANCE_BELOW_ZERO')
        })

        it('decreaseAllowance without any tokens works', async () => {
          const decreaseAmount = ethers.utils.parseEther('50')

          await expect(tenderToken.connect(signers[2]).decreaseAllowance(account1, decreaseAmount))
            .to.emit(tenderToken, 'Approval')
            .withArgs(account2, account1, transferAmount.sub(decreaseAmount))

          expect(await tenderToken.allowance(account2, account1)).to.eq(transferAmount.sub(decreaseAmount))
        })

        it('decreaseAllowance with requested amount subs it from allowance and emits event', async () => {
          const decreaseAmount = ethers.utils.parseEther('50')

          await expect(tenderToken.decreaseAllowance(account1, decreaseAmount))
            .to.emit(tenderToken, 'Approval')
            .withArgs(account0, account1, transferAmount.sub(decreaseAmount))

          expect(await tenderToken.allowance(account0, account1)).to.eq(transferAmount.sub(decreaseAmount))
        })
      })
    })
  })

  describe('with non-zero supply', async () => {
    const totalSupply = ethers.utils.parseEther('120')
    const acc0Balance = ethers.utils.parseEther('100')
    const acc2Balance = ethers.utils.parseEther('20')

    it('allowance behavior is correct after slashing', async () => {
      await tenderToken.mint(account0, acc0Balance)
      await tenderToken.mint(account2, acc2Balance)

      const amount = ethers.utils.parseEther('75')
      await tenderToken.approve(account1, amount)

      const divisor = ethers.constants.Two
      const newSupply = totalSupply.div(divisor)
      await tenderToken.setTotalPooledTokens(newSupply)

      expect(await tenderToken.balanceOf(account0)).to.eq(acc0Balance.div(divisor))
      expect(await tenderToken.balanceOf(account2)).to.eq(acc2Balance.div(divisor))
      expect(await tenderToken.balanceOf(account1)).to.eq(ethers.constants.Zero)

      expect(await tenderToken.sharesOf(account0)).to.eq(acc0Balance)
      expect(await tenderToken.sharesOf(account2)).to.eq(acc2Balance)
      expect(await tenderToken.sharesOf(account1)).to.eq(ethers.constants.Zero)

      expect(await tenderToken.allowance(account0, account1)).to.eq(amount)

      // Account 0's token balance shifted from 100 to 50 after the rebase
      // transferFrom for 75 tokens would fail
      // The allowance hasn't changed due to the rebase (TODO: SHOULD IT ?)
      // So account1 can still spend up to min(allowance, balanceOf(account0))
      await expect(tenderToken.connect(signers[1]).transferFrom(account0, account1, amount))
        .to.be.revertedWith('TRANSFER_AMOUNT_EXCEEDS_BALANCE')

      await expect(tenderToken.connect(signers[1]).transferFrom(account0, account1, acc0Balance.div(divisor)))
        .to.emit(tenderToken, 'Transfer')
        .withArgs(account0, account1, acc0Balance.div(divisor))

      // account 1 still has 25 in allowance remaining
      expect(await tenderToken.allowance(account0, account1)).to.eq(amount.sub(acc0Balance.div(divisor)))

      expect(await tenderToken.balanceOf(account0)).to.eq(ethers.constants.Zero)
      expect(await tenderToken.balanceOf(account1)).to.eq(acc0Balance.div(divisor))
      expect(await tenderToken.balanceOf(account2)).to.eq(acc2Balance.div(divisor))

      expect(await tenderToken.sharesOf(account0)).to.eq(ethers.constants.Zero)
      expect(await tenderToken.sharesOf(account1)).to.eq(acc0Balance)
      expect(await tenderToken.sharesOf(account2)).to.eq(acc2Balance)
    })

    describe('mint', () => {
      it('reverts if msg.sender is not owner', async () => {
        await expect(tenderToken.connect(signers[1]).mint(account1, ethers.utils.parseEther('1000')))
          .to.be.revertedWith('Ownable: caller is not the owner')
      })

      it('mints no shares if there is no pooled ether', async () => {
        const mint0 = ethers.utils.parseEther('0')
        await tenderToken.mint(account0, mint0)

        expect(await tenderToken.sharesOf(account0)).to.eq(ethers.constants.Zero)
        expect(await tenderToken.balanceOf(account0)).to.eq(ethers.constants.Zero)
        expect(await tenderToken.totalSupply()).to.eq(ethers.constants.Zero)
        expect(await tenderToken.getTotalShares()).to.eq(ethers.constants.Zero)
      })

      it('mint works', async () => {
        const mint0 = ethers.utils.parseEther('50')

        // totalSupply == totalPooledTokens
        await tenderToken.mint(account0, mint0)
        await tenderToken.setTotalPooledTokens(mint0)

        expect(await tenderToken.totalSupply()).to.eq(mint0)
        expect(await tenderToken.getTotalShares()).to.eq(mint0)
        expect(await tenderToken.balanceOf(account0)).to.eq(mint0)
        expect(await tenderToken.balanceOf(account1)).to.eq(ethers.constants.Zero)
        expect(await tenderToken.balanceOf(account2)).to.eq(ethers.constants.Zero)
        expect(await tenderToken.sharesOf(account0)).to.eq(mint0)
        expect(await tenderToken.sharesOf(account1)).to.eq(ethers.constants.Zero)
        expect(await tenderToken.sharesOf(account2)).to.eq(ethers.constants.Zero)

        // shares > totalPooledTokens
        const multiplier = ethers.BigNumber.from(2)
        await tenderToken.mint(account1, mint0)
        await tenderToken.setTotalPooledTokens(mint0)

        expect(await tenderToken.totalSupply()).to.eq(mint0)
        expect(await tenderToken.getTotalShares()).to.eq(mint0.mul(multiplier))
        expect(await tenderToken.balanceOf(account0)).to.eq(mint0.div(multiplier))
        expect(await tenderToken.balanceOf(account1)).to.eq(mint0.div(multiplier))
        expect(await tenderToken.balanceOf(account2)).to.eq(ethers.constants.Zero)
        expect(await tenderToken.sharesOf(account0)).to.eq(mint0)
        expect(await tenderToken.sharesOf(account1)).to.eq(mint0)
        expect(await tenderToken.sharesOf(account2)).to.eq(ethers.constants.Zero)

        // shares < totalPooledTokens
        const mint1 = ethers.utils.parseEther('200')
        await tenderToken.setTotalPooledTokens(mint1)

        expect(await tenderToken.totalSupply()).to.eq(mint1)
        expect(await tenderToken.getTotalShares()).to.eq(mint0.mul(multiplier))
        expect(await tenderToken.balanceOf(account0)).to.eq(mint0.mul(multiplier))
        expect(await tenderToken.balanceOf(account1)).to.eq(mint0.mul(multiplier))
        expect(await tenderToken.balanceOf(account2)).to.eq(ethers.constants.Zero)
        expect(await tenderToken.sharesOf(account0)).to.eq(mint0)
        expect(await tenderToken.sharesOf(account1)).to.eq(mint0)
        expect(await tenderToken.sharesOf(account2)).to.eq(ethers.constants.Zero)

        // Mint for someone
        await tenderToken.mint(account2, mint1)
        expect(await tenderToken.balanceOf(account2)).to.eq(mint1)
      })

      it('minting after a rebase still mints correctly', async () => {
        await tenderToken.mint(account0, acc0Balance)
        await tenderToken.mint(account2, acc2Balance)

        const multiplier = BigNumber.from(2)
        await tenderToken.setTotalPooledTokens(totalSupply.mul(multiplier))

        const mint0 = ethers.utils.parseEther('10')
        const mint1 = ethers.utils.parseEther('20')
        const mint2 = ethers.utils.parseEther('30')
        await tenderToken.mint(account0, mint0)
        await tenderToken.mint(account1, mint1)
        await tenderToken.mint(account2, mint2)

        expect(await tenderToken.balanceOf(account0)).to.eq(acc0Balance.mul(multiplier).add(mint0))
        expect(await tenderToken.balanceOf(account1)).to.eq(mint1)
        expect(await tenderToken.balanceOf(account2)).to.eq(acc2Balance.mul(multiplier).add(mint2))
      })

      it('reverts when mint to zero address', async () => {
        await expect(tenderToken.mint(ethers.constants.AddressZero, ethers.utils.parseEther('100')))
          .to.be.revertedWith('MINT_TO_THE_ZERO_ADDRESS')
      })
    })

    describe('burn', () => {
      const totalSupply = ethers.utils.parseEther('200')
      const acc0Balance = ethers.utils.parseEther('100')
      const acc1Balance = ethers.utils.parseEther('100')

      beforeEach(async () => {
        await tenderToken.mint(account0, acc0Balance)
        await tenderToken.mint(account1, acc1Balance)
      })

      it('reverts if msg.sender is not owner', async () => {
        await expect(tenderToken.connect(signers[1]).burn(account1, ethers.utils.parseEther('1000')))
          .to.be.revertedWith('Ownable: caller is not the owner')
      })

      it('reverts when burn from zero address', async () => {
        await expect(tenderToken.burn(ethers.constants.AddressZero, ethers.utils.parseEther('100')))
          .to.be.revertedWith('BURN_FROM_THE_ZERO_ADDRESS')
      })

      it('reverts when burn amount exceeds balance', async () => {
        await expect(tenderToken.burn(account2, ethers.utils.parseEther('100')))
          .to.be.revertedWith('BURN_AMOUNT_EXCEEDS_BALANCE')
      })

      it('burning zero value works', async () => {
        const zero = ethers.constants.Zero
        await tenderToken.burn(account0, zero)

        expect(await tenderToken.totalSupply()).to.eq(totalSupply)
        expect(await tenderToken.balanceOf(account0)).to.eq(acc0Balance)
        expect(await tenderToken.balanceOf(account1)).to.eq(acc1Balance)
        expect(await tenderToken.balanceOf(account2)).to.eq(zero)

        expect(await tenderToken.getTotalShares()).to.eq(totalSupply)
        expect(await tenderToken.sharesOf(account0)).to.eq(acc0Balance)
        expect(await tenderToken.sharesOf(account1)).to.eq(acc1Balance)
        expect(await tenderToken.sharesOf(account2)).to.eq(zero)
      })

      it('burning works (redistributes tokens)', async () => {
        const tokensToBurn = acc1Balance.div(ethers.BigNumber.from(2))
        const zero = ethers.constants.Zero
        await tenderToken.burn(account1, tokensToBurn)

        expect(await tenderToken.totalSupply()).to.eq(totalSupply.sub(tokensToBurn))
        expect(await tenderToken.balanceOf(account0)).to.eq(acc0Balance)
        expect(await tenderToken.balanceOf(account1)).to.eq(acc1Balance.sub(tokensToBurn))
        expect(await tenderToken.balanceOf(account2)).to.eq(zero)

        expect(await tenderToken.getTotalShares()).to.eq(totalSupply.sub(tokensToBurn))
        expect(await tenderToken.sharesOf(account0)).to.eq(acc0Balance)
        expect(await tenderToken.sharesOf(account1)).to.eq(acc1Balance.sub(tokensToBurn))
        expect(await tenderToken.sharesOf(account2)).to.eq(zero)
      })

      it('burning after a rebase burns the correct amount of shares', async () => {
        // Burning after rebase yield correct amount of shares burnt
        const multiplier = ethers.BigNumber.from(2)
        await tenderToken.setTotalPooledTokens(totalSupply.mul(multiplier))

        expect(await tenderToken.balanceOf(account0)).to.eq(acc0Balance.mul(2))

        // Burning 1/4th the tokens should burn 1/4th of shares
        // After the rebase account0's balance is acc0Balance*multiplier (so double)
        const tokensToBurn = acc0Balance.div(multiplier)
        await tenderToken.burn(account0, tokensToBurn)

        expect(await tenderToken.totalSupply()).to.eq(totalSupply.mul(multiplier).sub(tokensToBurn))
        expect(await tenderToken.balanceOf(account0)).to.eq(acc0Balance.mul(multiplier).sub(tokensToBurn))
        expect(await tenderToken.getTotalShares()).to.eq(totalSupply.sub(tokensToBurn.div(2)))
        expect(await tenderToken.sharesOf(account0)).to.eq(acc0Balance.sub(tokensToBurn.div(2)))
      })

      it('allowance behavior is correct after burning', async () => {
        const approveAmount = ethers.utils.parseEther('75')
        await tenderToken.approve(account1, approveAmount)

        const tokensToBurn = acc1Balance.div(ethers.BigNumber.from(2))
        await tenderToken.burn(account0, tokensToBurn)

        expect(await tenderToken.balanceOf(account0)).eq(acc1Balance.sub(tokensToBurn))
        expect(await tenderToken.allowance(account0, account1)).to.eq(approveAmount)

        await expect(tenderToken.connect(signers[1]).transferFrom(account0, account1, approveAmount))
          .to.be.revertedWith('TRANSFER_AMOUNT_EXCEEDS_BALANCE')

        await expect(tenderToken.connect(signers[1]).transferFrom(account0, account1, tokensToBurn))
          .to.emit(tenderToken, 'Transfer')
          .withArgs(account0, account1, tokensToBurn)

        expect(await tenderToken.balanceOf(account1)).to.eq(acc1Balance.add(tokensToBurn))
        expect(await tenderToken.balanceOf(account0)).to.eq(ethers.constants.Zero)
        expect(await tenderToken.allowance(account0, account1)).to.eq(approveAmount.sub(tokensToBurn))
      })
    })
  })

  describe('share-related getters', async () => {
    const zero = ethers.constants.Zero
    describe('with zero totalPooledTokens (supply)', async () => {
      it('getTotalSupply', async () => {
        expect(await tenderToken.totalSupply()).to.eq(zero)
      })

      it('getTotalShares', async () => {
        expect(await tenderToken.getTotalShares()).to.eq(zero)
      })

      it('getTotalPooledTokens', async () => {
        expect(await tenderToken.getTotalPooledTokens()).to.eq(zero)
      })

      it('sharesOf', async () => {
        expect(await tenderToken.sharesOf(account0)).to.eq(zero)
      })

      it('tokensToShares', async () => {
        expect(await tenderToken.tokensToShares(ethers.utils.parseEther('0'))).to.eq(zero)
        expect(await tenderToken.tokensToShares(ethers.utils.parseEther('1'))).to.eq(zero)
        expect(await tenderToken.tokensToShares(ethers.utils.parseEther('100'))).to.eq(zero)
      })

      it('balanceOf', async () => {
        expect(await tenderToken.balanceOf(account0)).to.eq(zero)
      })

      it('sharesToTokens', async () => {
        expect(await tenderToken.sharesToTokens(ethers.utils.parseEther('0'))).to.eq(zero)
        expect(await tenderToken.sharesToTokens(ethers.utils.parseEther('1'))).to.eq(zero)
        expect(await tenderToken.sharesToTokens(ethers.utils.parseEther('100'))).to.eq(zero)
      })
    })

    describe('with non-zero totalPooledTokens (supply)', async () => {
      const totalSupply = ethers.utils.parseEther('1000')
      const acc0Balance = ethers.utils.parseEther('500')
      const acc1Balance = ethers.utils.parseEther('250')
      const acc2Balance = ethers.utils.parseEther('250')
      beforeEach(async () => {
        await tenderToken.mint(account0, acc0Balance)
        await tenderToken.mint(account1, acc1Balance)
        await tenderToken.mint(account2, acc2Balance)
      })

      it('getTotalSupply', async () => {
        expect(await tenderToken.totalSupply()).to.eq(totalSupply)
      })

      it('getTotalPooledTokens', async () => {
        expect(await tenderToken.getTotalPooledTokens()).to.eq(totalSupply)
      })

      it('getTotalShares', async () => {
        expect(await tenderToken.getTotalShares()).to.eq(totalSupply)
      })

      it('sharesOf', async () => {
        expect(await tenderToken.sharesOf(account0)).to.eq(acc0Balance)
        expect(await tenderToken.sharesOf(account1)).to.eq(acc1Balance)
        expect(await tenderToken.sharesOf(account2)).to.eq(acc2Balance)
      })

      it('sharesToTokens', async () => {
        expect(await tenderToken.sharesToTokens(ethers.constants.Zero)).to.eq(ethers.constants.Zero)
        expect(await tenderToken.sharesToTokens(ethers.utils.parseEther('1'))).to.eq(ethers.utils.parseEther('1'))
        expect(await tenderToken.sharesToTokens(ethers.utils.parseEther('2'))).to.eq(ethers.utils.parseEther('2'))
        expect(await tenderToken.sharesToTokens(totalSupply)).to.eq(totalSupply)
      })

      it('balanceOf', async () => {
        expect(await tenderToken.balanceOf(account0)).to.eq(acc0Balance)
        expect(await tenderToken.balanceOf(account1)).to.eq(acc1Balance)
        expect(await tenderToken.balanceOf(account2)).to.eq(acc2Balance)
      })

      it('tokensToShares', async () => {
        expect(await tenderToken.tokensToShares(ethers.constants.Zero)).to.eq(ethers.constants.Zero)
        expect(await tenderToken.tokensToShares(ethers.utils.parseEther('1'))).to.eq(ethers.utils.parseEther('1'))
        expect(await tenderToken.tokensToShares(ethers.utils.parseEther('2'))).to.eq(ethers.utils.parseEther('2'))
        expect(await tenderToken.tokensToShares(totalSupply)).to.eq(totalSupply)
      })

      describe('rebase occurs', () => {
        const additionalAmount = ethers.utils.parseEther('200')
        const newTotalPooledTokens = totalSupply.add(additionalAmount)

        beforeEach(async () => {
          await tenderToken.setTotalPooledTokens(newTotalPooledTokens)
        })

        it('getTotalSupply', async () => {
          expect(await tenderToken.totalSupply()).to.eq(newTotalPooledTokens)
        })

        it('getTotalPooledTokens', async () => {
          expect(await tenderToken.getTotalPooledTokens()).to.eq(newTotalPooledTokens)
        })

        it('getTotalShares', async () => {
          expect(await tenderToken.getTotalShares()).to.eq(totalSupply)
        })

        it('sharesOf', async () => {
          expect(await tenderToken.sharesOf(account0)).to.eq(acc0Balance)
          expect(await tenderToken.sharesOf(account1)).to.eq(acc1Balance)
          expect(await tenderToken.sharesOf(account2)).to.eq(acc2Balance)
        })

        it('sharesToTokens', async () => {
          expect(await tenderToken.sharesToTokens(ethers.constants.Zero)).to.eq(ethers.constants.Zero)
          expect(await tenderToken.sharesToTokens(ethers.utils.parseEther('1'))).to.eq(ethers.utils.parseEther('1').mul(newTotalPooledTokens).div(totalSupply))
          expect(await tenderToken.sharesToTokens(ethers.utils.parseEther('2'))).to.eq(ethers.utils.parseEther('2').mul(newTotalPooledTokens).div(totalSupply))
          expect(await tenderToken.sharesToTokens(totalSupply)).to.eq(totalSupply.mul(newTotalPooledTokens).div(totalSupply))
        })

        it('balanceOf', async () => {
          expect(await tenderToken.balanceOf(account0)).to.eq(acc0Balance.mul(newTotalPooledTokens).div(totalSupply))
          expect(await tenderToken.balanceOf(account1)).to.eq(acc1Balance.mul(newTotalPooledTokens).div(totalSupply))
          expect(await tenderToken.balanceOf(account2)).to.eq(acc2Balance.mul(newTotalPooledTokens).div(totalSupply))
        })

        it('tokensToShares', async () => {
          expect(await tenderToken.tokensToShares(ethers.constants.Zero)).to.eq(ethers.constants.Zero)
          expect(await tenderToken.tokensToShares(ethers.utils.parseEther('1'))).to.eq(tokensToShares(ethers.utils.parseEther('1'), totalSupply, newTotalPooledTokens))
          expect(await tenderToken.tokensToShares(ethers.utils.parseEther('2'))).to.eq(tokensToShares(ethers.utils.parseEther('2'), totalSupply, newTotalPooledTokens))
          expect(await tenderToken.tokensToShares(totalSupply)).to.eq(tokensToShares(totalSupply, totalSupply, newTotalPooledTokens))
        })
      })
    })

    describe('Check precision bounds (use large numbers)', async () => {
      const acc0Balance = ethers.utils.parseEther('20000000000000000000000000000000000')
      const acc1Balance = ethers.utils.parseEther('100000000000000000000000000000000000')
      const acc2Balance = ethers.utils.parseEther('1000000000000000000000000000000000000')
      const totalSupply = acc0Balance.add(acc1Balance).add(acc2Balance)
      beforeEach(async () => {
        await tenderToken.mint(account0, acc0Balance)
        await tenderToken.mint(account1, acc1Balance)
        await tenderToken.mint(account2, acc2Balance)
      })

      it('getTotalSupply', async () => {
        expect(await tenderToken.totalSupply()).to.eq(totalSupply)
      })

      it('getTotalPooledTokens', async () => {
        expect(await tenderToken.getTotalPooledTokens()).to.eq(totalSupply)
      })

      it('getTotalShares', async () => {
        expect(await tenderToken.getTotalShares()).to.eq(totalSupply)
      })

      it('sharesOf', async () => {
        expect(await tenderToken.sharesOf(account0)).to.eq(acc0Balance)
        expect(await tenderToken.sharesOf(account1)).to.eq(acc1Balance)
        expect(await tenderToken.sharesOf(account2)).to.eq(acc2Balance)
      })

      it('sharesToTokens', async () => {
        expect(await tenderToken.sharesToTokens(ethers.constants.Zero)).to.eq(ethers.constants.Zero)
        expect(await tenderToken.sharesToTokens(ethers.utils.parseEther('1'))).to.eq(ethers.utils.parseEther('1'))
        expect(await tenderToken.sharesToTokens(ethers.utils.parseEther('2'))).to.eq(ethers.utils.parseEther('2'))
        expect(await tenderToken.sharesToTokens(totalSupply)).to.eq(totalSupply)
      })

      it('balanceOf', async () => {
        expect(await tenderToken.balanceOf(account0)).to.eq(acc0Balance)
        expect(await tenderToken.balanceOf(account1)).to.eq(acc1Balance)
        expect(await tenderToken.balanceOf(account2)).to.eq(acc2Balance)
      })

      it('tokensToShares', async () => {
        expect(await tenderToken.tokensToShares(ethers.constants.Zero)).to.eq(ethers.constants.Zero)
        expect(await tenderToken.tokensToShares(ethers.utils.parseEther('1'))).to.eq(ethers.utils.parseEther('1'))
        expect(await tenderToken.tokensToShares(ethers.utils.parseEther('2'))).to.eq(ethers.utils.parseEther('2'))
        expect(await tenderToken.tokensToShares(totalSupply)).to.eq(totalSupply)
      })

      describe('rebase occurs', () => {
        const additionalAmount = ethers.utils.parseEther('200')
        const newTotalPooledTokens = totalSupply.add(additionalAmount)

        beforeEach(async () => {
          await tenderToken.setTotalPooledTokens(newTotalPooledTokens)
        })

        it('getTotalSupply', async () => {
          expect(await tenderToken.totalSupply()).to.eq(newTotalPooledTokens)
        })

        it('getTotalPooledTokens', async () => {
          expect(await tenderToken.getTotalPooledTokens()).to.eq(newTotalPooledTokens)
        })

        it('getTotalShares', async () => {
          expect(await tenderToken.getTotalShares()).to.eq(totalSupply)
        })

        it('sharesOf', async () => {
          expect(await tenderToken.sharesOf(account0)).to.eq(acc0Balance)
          expect(await tenderToken.sharesOf(account1)).to.eq(acc1Balance)
          expect(await tenderToken.sharesOf(account2)).to.eq(acc2Balance)
        })

        it('sharesToTokens', async () => {
          expect(await tenderToken.sharesToTokens(ethers.constants.Zero)).to.eq(ethers.constants.Zero)
          expect(await tenderToken.sharesToTokens(ethers.utils.parseEther('1'))).to.eq(sharesToTokens(ethers.utils.parseEther('1'), totalSupply, newTotalPooledTokens))
          expect(await tenderToken.sharesToTokens(ethers.utils.parseEther('2'))).to.eq(sharesToTokens(ethers.utils.parseEther('2'), totalSupply, newTotalPooledTokens))
          expect(await tenderToken.sharesToTokens(totalSupply)).to.eq(sharesToTokens(totalSupply, totalSupply, newTotalPooledTokens))
        })

        it('balanceOf', async () => {
          expect(await tenderToken.balanceOf(account0)).to.eq(sharesToTokens(acc0Balance, totalSupply, newTotalPooledTokens))
          expect(await tenderToken.balanceOf(account1)).to.eq(sharesToTokens(acc1Balance, totalSupply, newTotalPooledTokens))
          expect(await tenderToken.balanceOf(account2)).to.eq(sharesToTokens(acc2Balance, totalSupply, newTotalPooledTokens))
        })

        it('tokensToShares', async () => {
          expect(await tenderToken.tokensToShares(ethers.constants.Zero)).to.eq(ethers.constants.Zero)
          expect(await tenderToken.tokensToShares(ethers.utils.parseEther('1'))).to.eq(tokensToShares(ethers.utils.parseEther('1'), totalSupply, newTotalPooledTokens))
          expect(await tenderToken.tokensToShares(ethers.utils.parseEther('2'))).to.eq(tokensToShares(ethers.utils.parseEther('2'), totalSupply, newTotalPooledTokens))
          expect(await tenderToken.tokensToShares(totalSupply)).to.eq(tokensToShares(totalSupply, totalSupply, newTotalPooledTokens))
        })
      })
    })
  })
})
