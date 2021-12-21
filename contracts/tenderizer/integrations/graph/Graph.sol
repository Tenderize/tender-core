// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../../libs/MathUtils.sol";

import "../../Tenderizer.sol";
import "./IGraph.sol";

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
        IGraph _graph,
        address _node
    ) public {
        Tenderizer._initialize(_steak, _node, msg.sender);
        graph = _graph;
    }

    function calcDepositOut(uint256 amountIn) public view override returns (uint256){
        return amountIn - (uint256(graph.delegationTaxPercentage()) * amountIn / MAX_PPM);
    }

    function _deposit(address _from, uint256 _amount) internal override{
        uint256 amountOut = calcDepositOut(_amount);
        currentPrincipal += amountOut;

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

        // approve amount to Graph protocol
        steak.approve(address(graph), amount);

        // stake tokens
        graph.delegate(node_, amount);

        emit Stake(node_, amount);
    }

    function _unstake(
        address _account,
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

        // Unstake from governance
        if (_account == controller) {
            // Check that no governance unstake is pending
            require(governancePendingUnstakeLockID == governanceLastProcessedUnstakeLockID, "GOV_WITHDRAW_PENDING");

            amount = pendingUnstakes;
            pendingUnstakes = 0;
            governancePendingUnstakeLockID = unstakeLockID;

            // Calculate the amount of shares to undelegate
            IGraph.Delegation memory delegation = graph.getDelegation(node, address(this));
            IGraph.DelegationPool memory delPool = graph.delegationPools(node);

            uint256 delShares = delegation.shares;
            uint256 totalShares = delPool.shares;
            uint256 totalTokens = delPool.tokens;

            uint256 stake = delShares * totalTokens / totalShares;
            uint256 shares = delShares *  amount / stake;

            // undelegate shares
            graph.undelegate(node_, shares);
        } else {
            require(amount > 0, "ZERO_AMOUNT");

            currentPrincipal -= amount;
            pendingUnstakes += amount;
        }

        nextUnstakeLockID = unstakeLockID + 1;
        unstakeLocks[unstakeLockID] = UnstakeLock({ amount: amount, account: _account });

        emit Unstake(_account, node_, amount, unstakeLockID);
    }

    function _withdraw(address _account, uint256 _unstakeLockID) internal override {
        UnstakeLock storage lock = unstakeLocks[_unstakeLockID];
        address account = lock.account;
        uint256 amount = lock.amount;

        delete unstakeLocks[_unstakeLockID];

        // Check that a withdrawal is pending and valid
        require(account == _account, "ACCOUNT_MISTMATCH");
        require(amount > 0, "ZERO_AMOUNT");

        if (_account == controller) {
            governanceLastProcessedUnstakeLockID = governancePendingUnstakeLockID;
            graph.withdrawDelegated(node, ZERO_ADDRESS);
        } else {
            // Check that gov withdrawal for that unstake has occured
            require(_unstakeLockID < governanceLastProcessedUnstakeLockID, "GOV_WITHDRAW_PENDING");
            
            // Transfer amount from unbondingLock to _account
            try steak.transfer(_account, amount) {
            } catch {
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
        // GRT automatically compounds
        // The rewards is the difference between
        // pending stake and the latest cached stake amount

        address del = address(this);
        uint256 currentPrincipal_ = currentPrincipal;

        IGraph.Delegation memory delegation = graph.getDelegation(node, del);
        IGraph.DelegationPool memory delPool = graph.delegationPools(node);

        uint256 delShares = delegation.shares;
        uint256 totalShares = delPool.shares;
        uint256 totalTokens = delPool.tokens;

        uint256 stake = delShares * totalTokens / totalShares;

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
        graph = IGraph(_stakingContract);
        emit GovernanceUpdate("STAKING_CONTRACT");
    }
}
