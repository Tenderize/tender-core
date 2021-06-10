// // SPDX-FileCopyrightText: 2020 Tenderize <info@tenderize.me>

// // SPDX-License-Identifier: GPL-3.0

// /* See contracts/COMPILERS.md */
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../../libs/MathUtils.sol";

import "../../Tenderizer.sol";
import "./IMatic.sol";

contract Matic is Tenderizer {

    // Matic exchange rate precision
    uint256 constant EXCHANGE_RATE_PRECISION = 100;

    // Matic stakeManager address
    address maticStakeManager;

    // Matic ValidatorShare
    IMatic matic;

    mapping (address => uint256) pendingWithdrawals;
    uint256 totalPendingWithdrawals;

    function initialize(IERC20 _steak, address _matic, address _node) public {
        Tenderizer._initialize(_steak, _node, msg.sender);
        maticStakeManager = _matic;
        matic = IMatic(_node);
    }

    function setNode(address _node) external override onlyController {
        require(_node != address(0), "ZERO_ADDRESS");
        node = _node;
        matic = IMatic(_node);
    }

    function _deposit(address _from, uint256 _amount) internal override {
        currentPrincipal += _amount;
        super._deposit(_from, _amount);
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

        // use default validator share contract if _node isn't specified
        IMatic matic_ = matic;
        if (_node != address(0)) {
            matic_ = IMatic(_node);
        }

        // approve tokens
        steak.approve(maticStakeManager, amount);

        // stake tokens
        matic_.buyVoucher(amount, tokensToShares(amount));

        super._stake(address(matic_), amount);
    }

    function _unstake(address _account, address _node, uint256 _amount) internal override {
        // use default validator share contract if _node isn't specified
        IMatic matic_ = matic;
        if (_node != address(0)) {
            matic_ = IMatic(_node);
        }

        // subtract principle
        currentPrincipal = currentPrincipal - _amount;

        // Track unstake for withdrawal
        pendingWithdrawals[_account] += _amount;
        totalPendingWithdrawals += _amount;
    }
    
    function _unstakeFromProtocol() internal override {
        // Check that are pending withrawals
        require(totalPendingWithdrawals > 0, "NO_TOTAL_PENDING_WITHDRAWAL");
       
        // unstake
        matic.sellVoucher(tokensToShares(totalPendingWithdrawals));
    }

    function _withdraw(address _account, uint256 /*_amount*/) internal override {
        // Get users pending withdrawal
        uint256 amount = pendingWithdrawals[_account];
        
        // Check that some amount is unstaked
        require(amount > 0, "NO_PENDING_WITHDRAWAL");

        // Check that no withdrawFromProtocol() pending
        require(totalPendingWithdrawals == 0, "GOVERNANANCE_UNSTAKE_PENDING");

        // Delete pending withrawal for user
        delete pendingWithdrawals[_account];

        // Transer steak to _account
        steak.transfer(_account, amount);
    }

    function _withdrawFromProtocol() internal override {
        // Check that are pending withrawals
        require(totalPendingWithdrawals > 0, "NO_TOTAL_PENDING_WITHDRAWAL");

        // Set 0 pending withdrawals
        totalPendingWithdrawals = 0;

        // Claim the unstaked tokens
        matic.unstakeClaimTokens();
    }

    function _claimRewards() internal override {
        // restake to compound rewards
        
        try matic.restake() {

        } catch {

        } 

        // calculate rewards and fees
        uint256 rewards;
        uint256 stake;

        {
            uint256 shares = matic.balanceOf(address(this));
            uint256 fxRate = matic.exchangeRate();
            if (fxRate == 0) fxRate = 1;
            stake = MathUtils.percOf(shares, fxRate, EXCHANGE_RATE_PRECISION);
            
            uint256 currentPrincipal_ = currentPrincipal;

            if (stake >= currentPrincipal_) {
                rewards = stake - currentPrincipal_;
            }
        }

        // Calculate fee
        uint256 fee = MathUtils.percOf(rewards, protocolFee);

        if (fee > 0 ) {
            pendingFees += fee;
        }
        
        // update principle and pendignFees
        currentPrincipal = stake - fee;

        emit RewardsClaimed(rewards, fee);
    }

    function _collectFees() internal override returns (uint256) {
        // set pendingFees to 0
        // Controller will mint tenderToken and distribute it
        uint256 before = pendingFees;
        pendingFees = 0;
        return before;
    }

    function _totalStakedTokens() internal override view returns (uint256) {
        return currentPrincipal;
    }

    function _setStakingContract(address _stakingContract) internal override {
        maticStakeManager = _stakingContract;
    }

    function tokensToShares(uint256 _tokens) internal view returns (uint256) {
        uint256 fxRate = matic.exchangeRate();
        if (fxRate == 0) fxRate = 1;
        return MathUtils.percOf(_tokens, EXCHANGE_RATE_PRECISION, fxRate);
    }
}
