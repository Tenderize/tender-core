// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../../libs/MathUtils.sol";

import "../../Tenderizer.sol";
import "./IAudius.sol";

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
        IAudius _audius,
        address _node
    ) public {
        Tenderizer._initialize(_steak, _node, msg.sender);
        audius = _audius;
        audiusStaking = audius.getStakingAddress();
    }

    function calcDepositOut(uint256 amountIn) public pure override returns (uint256){
        return amountIn;
    }

    function _deposit(address _from, uint256 _amount) internal override{
        currentPrincipal += _amount;

        emit Deposit(_from, _amount);
    }

    function _stake(address _node, uint256 _amount) internal override {
        // if no amount is specified, stake all available tokens
        uint256 amount = _amount;
        if (amount == 0) {
            amount = IERC20(steak).balanceOf(address(this));
        }

        if (amount == 0) {
            return;
            // TODO: revert ?
        }

        // if no _node is specified, stake towards the default node
        address node_ = _node;
        if (node_ == ZERO_ADDRESS) {
            node_ = node;
        }

        // Approve amount to Audius protocol
        steak.approve(audiusStaking, amount);

        // stake tokens
        audius.delegateStake(node_, amount);

        emit Stake(node_, amount);
    }

    function _unstake(
        address _caller,
        address _node,
        uint256 _amount
    ) internal override returns (uint256 unstakeLockID) {
        uint256 amount = _amount;
        unstakeLockID = nextUnstakeLockID;

        // if no _node is specified, stake towards the default node
        address node_ = _node;
        if (node_ == ZERO_ADDRESS) {
            node_ = node;
        }

        // If caller is controller, process all user unstake requests
        if (_caller == controller) {
            // Check that no governance unstake is pending
            require(governancePendingUnstakeLockID == governanceLastProcessedUnstakeLockID, "GOV_WITHDRAW_PENDING");

            amount = pendingUnstakes;
            pendingUnstakes = 0;
            governancePendingUnstakeLockID = unstakeLockID;

            // Undelegate from audius
            audius.requestUndelegateStake(node_, amount);
        } else {
            // Caller is a user, initialise unstake locally in Tenderizer
            require(amount > 0, "ZERO_AMOUNT");

            currentPrincipal -= amount;
            pendingUnstakes += amount;
        }

        nextUnstakeLockID = unstakeLockID + 1;
        unstakeLocks[unstakeLockID] = UnstakeLock({ amount: amount, account: _caller });

        emit Unstake(_caller, node_, amount, unstakeLockID);
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
        if (_caller == controller) {
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
        uint256 currentPrincipal_ = currentPrincipal;

        // Process the rewards for the nodes that we have staked to
        try audius.claimRewards(node) {} catch {}

        // Get the new total delegator stake
        uint256 stake = audius.getTotalDelegatorStake(address(this));

        uint256 rewards;
        if (stake >= currentPrincipal_) {
            rewards = stake - currentPrincipal_ - pendingFees - pendingLiquidityFees;
        }

        // Substract protocol fee amount and add it to pendingFees
        uint256 _pendingFees = pendingFees + MathUtils.percOf(rewards, protocolFee);
        pendingFees = _pendingFees;
        uint256 _liquidityFees = pendingLiquidityFees + MathUtils.percOf(rewards, liquidityFee);
        pendingLiquidityFees = _liquidityFees;
        // Add current pending stake minus fees and set it as current principal
        uint256 newPrincipal = stake - _pendingFees - _liquidityFees;
        currentPrincipal = newPrincipal;

        emit RewardsClaimed(rewards, newPrincipal, currentPrincipal_);
    }

    function _totalStakedTokens() internal view override returns (uint256) {
        return currentPrincipal;
    }

    function _setStakingContract(address _stakingContract) internal override {
        audius = IAudius(_stakingContract);
        audiusStaking = audius.getStakingAddress();

        emit GovernanceUpdate("STAKING_CONTRACT");
    }
}
