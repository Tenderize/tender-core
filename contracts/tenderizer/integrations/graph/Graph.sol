// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../../libs/MathUtils.sol";

import "../../Tenderizer.sol";
import "./IGraph.sol";

import { ITenderSwapFactory } from "../../../tenderswap/TenderSwapFactory.sol";

contract Graph is Tenderizer {
    // 100% in parts per million
    uint32 private constant MAX_PPM = 1000000;

    IGraph graph;

    // unstake lock ID of governance at the time governance unstakes
    uint256 governancePendingUnstakeLockID;
    // Set to governancePendingUnstakeLockID when governance withdrawal for the pending lock happens
    uint256 governanceLastProcessedUnstakeLockID;
    // Amount to unstake next by governance to process user withdrawals
    uint256 pendingUnstakes;

    function initialize(
        IERC20 _steak,
        string calldata _symbol,
        IGraph _graph,
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
        graph = _graph;
    }

    function _calcDepositOut(uint256 _amountIn) internal view override returns (uint256) {
        return _amountIn - ((uint256(graph.delegationTaxPercentage()) * _amountIn) / MAX_PPM);
    }

    function _deposit(address _from, uint256 _amount) internal override {
        currentPrincipal += _calcDepositOut(_amount);

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

        // approve amount to Graph protocol
        steak.approve(address(graph), amount);

        // stake tokens
        graph.delegate(_node, amount);

        emit Stake(_node, amount);
    }

    function _unstake(
        address _account,
        address _node,
        uint256 _amount
    ) internal override returns (uint256 unstakeLockID) {
        uint256 amount = _amount;
        unstakeLockID = nextUnstakeLockID;

        // Unstake from governance
        if (_account == gov) {
            // Check that no governance unstake is pending
            require(governancePendingUnstakeLockID == governanceLastProcessedUnstakeLockID, "GOV_WITHDRAW_PENDING");

            amount = pendingUnstakes;
            pendingUnstakes = 0;
            governancePendingUnstakeLockID = unstakeLockID;

            // Calculate the amount of shares to undelegate
            IGraph.DelegationPool memory delPool = graph.delegationPools(node);

            uint256 totalShares = delPool.shares;
            uint256 totalTokens = delPool.tokens;

            uint256 shares = (amount * totalShares) / totalTokens;

            // Shares =  amount * totalShares / totalTokens
            // undelegate shares
            graph.undelegate(_node, shares);
        } else {
            require(amount > 0, "ZERO_AMOUNT");

            currentPrincipal -= amount;
            pendingUnstakes += amount;
        }

        nextUnstakeLockID = unstakeLockID + 1;
        unstakeLocks[unstakeLockID] = UnstakeLock({ amount: amount, account: _account });

        emit Unstake(_account, _node, amount, unstakeLockID);
    }

    function _withdraw(address _account, uint256 _unstakeLockID) internal override {
        UnstakeLock storage lock = unstakeLocks[_unstakeLockID];
        address account = lock.account;
        uint256 amount = lock.amount;

        delete unstakeLocks[_unstakeLockID];

        // Check that a withdrawal is pending and valid
        require(account == _account, "ACCOUNT_MISTMATCH");
        require(amount > 0, "ZERO_AMOUNT");

        if (_account == gov) {
            governanceLastProcessedUnstakeLockID = governancePendingUnstakeLockID;
            graph.withdrawDelegated(node, address(0));
        } else {
            // Check that gov withdrawal for that unstake has occured
            require(_unstakeLockID < governanceLastProcessedUnstakeLockID, "GOV_WITHDRAW_PENDING");

            // Transfer amount from unbondingLock to _account
            try steak.transfer(_account, amount) {} catch {
                // Account for roundoff errors in shares calculations
                uint256 steakBal = steak.balanceOf(address(this));
                if (amount > steakBal) {
                    steak.transfer(_account, steakBal);
                }
            }
        }

        emit Withdraw(account, amount, _unstakeLockID);
    }

    function _claimRewards() internal override {
        IGraph.Delegation memory delegation = graph.getDelegation(node, address(this));
        IGraph.DelegationPool memory delPool = graph.delegationPools(node);

        uint256 delShares = delegation.shares;
        uint256 totalShares = delPool.shares;
        uint256 totalTokens = delPool.tokens;

        if (totalShares == 0) return;

        uint256 stake = (delShares * totalTokens) / totalShares;

        Tenderizer._processNewStake(stake);
    }

    function _setStakingContract(address _stakingContract) internal override {
        graph = IGraph(_stakingContract);
        emit GovernanceUpdate("STAKING_CONTRACT");
    }
}
