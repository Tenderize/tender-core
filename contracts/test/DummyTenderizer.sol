// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../libs/MathUtils.sol";

import "..//tenderizer/Tenderizer.sol";

import "../tenderizer/WithdrawalLocks.sol";

import "./DummyStaking.sol";

import { ITenderSwapFactory } from "../tenderswap/TenderSwapFactory.sol";

contract DummyTenderizer is Tenderizer {
    using WithdrawalLocks for WithdrawalLocks.Locks;
    using SafeERC20 for IERC20;

    DummyStaking dummyStaking;

    WithdrawalLocks.Locks withdrawLocks;

    function initialize(
        IERC20 _steak,
        string calldata _symbol,
        DummyStaking _dummyStaking,
        address _node,
        uint256 _protocolFee,
        uint256 _liquidityFee,
        ITenderToken _tenderTokenTarget,
        TenderFarmFactory _tenderFarmFactory,
        ITenderSwapFactory _tenderSwapFactory
    ) external {
        Tenderizer._initialize(
            _steak,
            _symbol,
            _node,
            _protocolFee,
            _liquidityFee,
            _tenderTokenTarget,
            _tenderFarmFactory,
            _tenderSwapFactory
        );
        dummyStaking = _dummyStaking;
    }

    function _deposit(address _from, uint256 _amount) internal override {
        currentPrincipal += _amount;

        emit Deposit(_from, _amount);
    }

    function _stake(uint256 _amount) internal override {
        uint256 amount = _amount;

        if (amount == 0) {
            return;
        }

        // approve amount to Livepeer protocol
        steak.safeApprove(address(dummyStaking), amount);

        // stake tokens
        dummyStaking.stake(amount, node);

        emit Stake(node, amount);
    }

    function _unstake(
        address _account,
        address _node,
        uint256 _amount
    ) internal override returns (uint256 withdrawalLockID) {
        uint256 amount = _amount;

        // Unbond tokens
        dummyStaking.unstake(amount, node);

        // Manage Livepeer unbonding locks
        withdrawalLockID = withdrawLocks.unlock(_account, amount);

        emit Unstake(_account, _node, amount, withdrawalLockID);
    }

    function _withdraw(address _account, uint256 _withdrawalID) internal override {
        uint256 amount = withdrawLocks.withdraw(_account, _withdrawalID);

        // Withdraw stake, transfers steak tokens to address(this)
        dummyStaking.withdraw(_withdrawalID);

        // Transfer amount from unbondingLock to _account
        steak.safeTransfer(_account, amount);

        emit Withdraw(_account, amount, _withdrawalID);
    }

    function _processNewStake() internal override returns (int256 rewards) {
        
        uint256 stake = dummyStaking.totalStaked();
        uint256 currentPrincipal_ = currentPrincipal;
        // adjust current token balance for potential protocol specific taxes or staking fees
        uint256 currentBal = _calcDepositOut(steak.balanceOf(address(this)));

        // calculate the new total stake
        stake += currentBal;

        rewards = int256(stake) - int256(currentPrincipal_); 

        currentPrincipal = stake;

        emit RewardsClaimed(rewards, stake, currentPrincipal_);
    }

    /**
     * @notice claims secondary rewards
     * these are rewards that are not from staking
     * but from fees that do not directly accumulate
     * towards stake. These could either be liquid
     * underlying tokens, or other tokens that then
     * need to be swapped using a DEX.
     * Secondary claimed fees will be immeadiatly
     * added to the balance of this contract
     * @dev this is implementation specific
     */
    function _claimSecondaryRewards() internal override {}

    function _setStakingContract(address _stakingContract) internal override {
        emit GovernanceUpdate(
            "STAKING_CONTRACT",
            abi.encode(dummyStaking),
            abi.encode(_stakingContract)
        );
        dummyStaking = DummyStaking(_stakingContract);
    }
}
