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

    mapping(address => uint256) pendingWithdrawals;
    uint256 totalPendingWithdrawals;

    function initialize(
        IERC20 _steak,
        address _matic,
        address _node
    ) public {
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

        // use default validator share contract if _node isn't specified
        IMatic matic_ = matic;
        if (_node != address(0)) {
            matic_ = IMatic(_node);
        }

        // approve tokens
        steak.approve(maticStakeManager, amount);

        // stake tokens
        uint256 fxRate = matic.exchangeRate();
        if (fxRate == 0) fxRate = 1;
        uint256 min = MathUtils.percOf(amount, EXCHANGE_RATE_PRECISION, fxRate);
        matic_.buyVoucher(amount, min);

        emit Stake(address(matic_), amount);
    }

    function _unstake(
        address _account,
        address _node,
        uint256 _amount
    ) internal override {
        //  // Check that no withdrawal is pending
        // require(pendingWithdrawals[_account] == 0, "PENDING_WITHDRAWAL");
        // uint256 amount = _amount;
        // // Sanity check. Controller already checks user deposits and withdrawals > 0
        // if (_account != owner()) require(amount > 0, "ZERO_AMOUNT");
        // if (amount == 0) {
        //     amount = IERC20(steak).balanceOf(address(this));
        // }
        // // if no _node is specified, stake towards the default node
        // IMatic node_ = IMatic(_node);
        // if (_node == address(0)) {
        //     node_ = IMatic(node);
        // }
        // currentPrincipal = currentPrincipal - _amount;
        // // undelegate shares
        // node_.sellVoucher(0);
    }

    function _withdraw(
        address _account,
        uint256 /*_amount*/,
        uint256 /*unstakeLockID*/
    ) internal override {
        // // Check that a withdrawal is pending
        // uint256 amount = graph.withdrawDelegated(node, ZERO_ADDRESS);
        // // Transfer amount from unbondingLock to _account
        // steak.transfer(_account, amount);
    }

    function _claimRewards() internal override {
        // restake to compound rewards

        try matic.restake() {} catch {}

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

        // Substract protocol fee amount and add it to pendingFees
        uint256 _pendingFees = pendingFees + MathUtils.percOf(rewards, protocolFee);
        pendingFees = _pendingFees;
        uint256 _liquidityFees = pendingLiquidityFees + MathUtils.percOf(rewards, liquidityFee);
        pendingLiquidityFees = _liquidityFees;
        // Add current pending stake minus fees and set it as current principal
        currentPrincipal = stake - _pendingFees - _liquidityFees;

        emit RewardsClaimed(rewards, currentPrincipal);
    }

    function _totalStakedTokens() internal view override returns (uint256) {
        return currentPrincipal;
    }

    function _setStakingContract(address _stakingContract) internal override {
        maticStakeManager = _stakingContract;

        emit GovernanceUpdate("STAKING_CONTRACT");
    }
}
