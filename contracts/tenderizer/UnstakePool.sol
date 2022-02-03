// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

import "../libs/MathUtils.sol";
pragma solidity 0.8.4;

library UnstakePool {
    struct Withdrawal {
        uint256 shares; // shares
        address receiver; // address of the receiver of this withdrawal, usually the caller of unlock
        uint256 epoch; // epoch at time of unlock
    }

    struct WithdrawalPool {
        mapping(uint256 => Withdrawal) withdrawals; // key,value to keep track of withdrawals
        uint256 withdrawalID; // incrementor to keep track of the key for the 'withdrawals' mapping
        uint256 shares; // total outstanding shares of the unstake pool
        uint256 amount; // total amount of available tokens
        uint256 pendingUnlock; // amount of tokens to unlock
        uint256 epoch; // current epoch start (e.g. incrementor or block number)
        uint256 lastEpoch; // last completed epoch (withdrawal completed)
    }

    function unlock(
        WithdrawalPool storage _pool,
        uint256 _amount,
        address _receiver
    ) internal returns (uint256 withdrawalID) {
        withdrawalID = _pool.withdrawalID;

        uint256 shares = calcShares(_pool, _amount);

        _pool.withdrawals[withdrawalID] = Withdrawal({
            shares: shares,
            receiver: _receiver,
            epoch: _pool.epoch
        });

        _pool.pendingUnlock += _amount;

        _pool.shares += shares;

        _pool.withdrawalID++;
    }

    function withdraw(WithdrawalPool storage _pool, uint256 _withdrawalID) internal returns (uint256 withdrawAmount) {
        Withdrawal memory withdrawal = _pool.withdrawals[_withdrawalID];

        require(withdrawal.epoch < _pool.lastEpoch, "ONGOING_UNLOCK");

        withdrawAmount = calcAmount(_pool, withdrawal.shares);

        _pool.amount -= withdrawAmount;

        _pool.shares -= withdrawal.shares;

        delete _pool.withdrawals[_withdrawalID];
    }

    function processUnlocks(WithdrawalPool storage _pool, uint256 _epochID) internal {
        _pool.pendingUnlock = 0;
        _pool.epoch = _epochID;
    }

    function processWihdrawal(WithdrawalPool storage _pool, uint256 _received) internal {
        _pool.amount += _received;
        _pool.lastEpoch = _pool.epoch;
    }

    function updateAmount(WithdrawalPool storage _pool, uint256 _newAmount) internal {
        // calculate relative amounts to subtract from 'amount' and 'pendingUnlock'
        uint256 amount = _pool.amount;
        uint256 pendingUnlock = _pool.pendingUnlock;
        uint256 total = amount + pendingUnlock;
        _pool.amount = _newAmount * amount / total;
        _pool.pendingUnlock = _newAmount * pendingUnlock / total;
    }

    function amount(WithdrawalPool storage _pool) internal view returns (uint256) {
        return _pool.amount;
    }

    function calcShares(WithdrawalPool storage _pool, uint256 _amount) internal view returns (uint256 shares) {
        uint256 totalTokens = _pool.amount + _pool.pendingUnlock;
        uint256 totalShares = _pool.shares;

        if (totalTokens == 0) return _amount;

        if (totalShares == 0) return _amount;

        return MathUtils.percOf(_amount, totalShares, totalTokens);
    }

    function calcAmount(WithdrawalPool storage _pool, uint256 _shares) internal view returns (uint256 amount) {
        uint256 totalShares = _pool.shares;
        if (totalShares == 0) return 0;

        return MathUtils.percOf(_shares, _pool.amount + _pool.pendingUnlock, totalShares);
    }
}
