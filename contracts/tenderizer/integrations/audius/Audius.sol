// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../../libs/MathUtils.sol";

import "../../Tenderizer.sol";
import "./IAudius.sol";

import { ITenderSwapFactory } from "../../../tenderswap/TenderSwapFactory.sol";

contract Audius is Tenderizer {
    IAudius audius;

    address audiusStaking;

    // unstake lock ID of governance at the time governance unstakes
    uint256 governancePendingUnstakeLockID;
    // Set to governancePendingUnstakeLockID when governance withdrawal for the pending lock happens
    uint256 governanceLastProcessedUnstakeLockID;
    // Amount to unstake next by governance to process user withdrawals
    uint256 pendingUnstakes;

    function initialize(
        IERC20 _steak,
        string calldata _symbol,
        IAudius _audius,
        address _node,
        uint256 _protocolFee,
        uint256 _liquidityFee,
        ITenderToken _tenderTokenTarget,
        TenderFarmFactory _tenderFarmFactory,
        ITenderSwapFactory _tenderSwapFactory
    ) public {
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
        audius = _audius;
        audiusStaking = audius.getStakingAddress();
    }

    function _deposit(address _from, uint256 _amount) internal override {
        currentPrincipal += _amount;

        emit Deposit(_from, _amount);
    }

    function _stake(address _node, uint256 _amount) internal override {
        // if no amount is specified, stake all available tokens
        uint256 amount = _amount;

        if (amount == 0) {
            return;
            // TODO: revert ?
        }

        // if no _node is specified, return
        if (_node == address(0)) {
            return;
        }

        // Approve amount to Audius protocol
        steak.approve(audiusStaking, amount);

        // stake tokens
        audius.delegateStake(_node, amount);

        emit Stake(_node, amount);
    }

    function _unstake(
        address _caller,
        address _node,
        uint256 _amount
    ) internal override returns (uint256 unstakeLockID) {
        uint256 amount = _amount;
        unstakeLockID = nextUnstakeLockID;

        // If caller is controller, process all user unstake requests
        if (_caller == gov) {
            // Check that no governance unstake is pending
            require(governancePendingUnstakeLockID == governanceLastProcessedUnstakeLockID, "GOV_WITHDRAW_PENDING");

            amount = pendingUnstakes;
            pendingUnstakes = 0;
            governancePendingUnstakeLockID = unstakeLockID;

            // Undelegate from audius
            audius.requestUndelegateStake(_node, amount);
        } else {
            // Caller is a user, initialise unstake locally in Tenderizer
            require(amount > 0, "ZERO_AMOUNT");

            currentPrincipal -= amount;
            pendingUnstakes += amount;
        }

        nextUnstakeLockID = unstakeLockID + 1;
        unstakeLocks[unstakeLockID] = UnstakeLock({ amount: amount, account: _caller });

        emit Unstake(_caller, _node, amount, unstakeLockID);
    }

    function _withdraw(address _caller, uint256 _unstakeLockID) internal override {
        UnstakeLock storage lock = unstakeLocks[_unstakeLockID];
        address account = lock.account;
        uint256 amount = lock.amount;

        delete unstakeLocks[_unstakeLockID];

        // Check that a withdrawal is pending and valid
        require(account == _caller, "ACCOUNT_MISTMATCH");
        require(amount > 0, "ZERO_AMOUNT");

        // If caller is controller, process all user unstakes
        if (_caller == gov) {
            governanceLastProcessedUnstakeLockID = governancePendingUnstakeLockID;
            // Withdraw from Audius
            audius.undelegateStake();
        } else {
            // Caller is a user, process its unstake if available
            // Check that gov withdrawal for that unstake has occured
            require(_unstakeLockID < governanceLastProcessedUnstakeLockID, "GOV_WITHDRAW_PENDING");
            // Transfer amount from unbondingLock to _account
            steak.transfer(_caller, amount);
        }

        emit Withdraw(account, amount, _unstakeLockID);
    }

    function _claimRewards() internal override {
        // Process the rewards for the nodes that we have staked to
        try audius.claimRewards(node) {} catch {}

        // Get the new total delegator stake
        uint256 stake = audius.getTotalDelegatorStake(address(this));

        Tenderizer._processNewStake(stake);
    }

    function _setStakingContract(address _stakingContract) internal override {
        audius = IAudius(_stakingContract);
        audiusStaking = audius.getStakingAddress();

        emit GovernanceUpdate("STAKING_CONTRACT");
    }
}
