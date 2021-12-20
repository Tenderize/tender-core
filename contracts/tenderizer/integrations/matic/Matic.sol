// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../../libs/MathUtils.sol";

import "../../Tenderizer.sol";
import "./IMatic.sol";

contract Matic is Tenderizer {
    // Matic exchange rate precision
    uint256 constant EXCHANGE_RATE_PRECISION = 100; // For Validator ID < 8
    uint256 constant EXCHANGE_RATE_PRECISION_HIGH = 10**29; // For Validator ID >= 8

    // Matic stakeManager address
    address maticStakeManager;

    // Matic ValidatorShare
    IMatic matic;

    function initialize(
        IERC20 _steak,
        address _matic,
        address _node,
        TenderTokenConfig calldata _tenderTokenConfig,
        TenderSwapConfig calldata _tenderSwapConfig
    ) public {
        Tenderizer._initialize(_steak, _node, _tenderTokenConfig, _tenderSwapConfig);
        maticStakeManager = _matic;
        matic = IMatic(_node);
    }

    function setNode(address _node) external override onlyGov {
        require(_node != address(0), "ZERO_ADDRESS");
        node = _node;
        matic = IMatic(_node);

        emit GovernanceUpdate("NODE");
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

        // use default validator share contract if _node isn't specified
        IMatic matic_ = matic;
        if (_node != address(0)) {
            matic_ = IMatic(_node);
        }

        // approve tokens
        steak.approve(maticStakeManager, amount);

        // stake tokens
        uint256 min = ((amount * _getExchangeRatePrecision(matic_)) / _getExchangeRate(matic_)) - 1;
        matic_.buyVoucher(amount, min);

        emit Stake(address(matic_), amount);
    }

    function _unstake(
        address _account,
        address _node,
        uint256 _amount
    ) internal override returns (uint256 unstakeLockID) {
        uint256 amount = _amount;

        // use default validator share contract if _node isn't specified
        IMatic matic_ = matic;
        if (_node != address(0)) {
            matic_ = IMatic(_node);
        }

        uint256 exhangeRatePrecision = _getExchangeRatePrecision(matic_);
        uint256 fxRate = _getExchangeRate(matic_);

        // Sanity check. Controller already checks user deposits and withdrawals > 0
        if (_account != gov) require(amount > 0, "ZERO_AMOUNT");
        if (amount == 0) {
            uint256 shares = matic_.balanceOf(address(this));
            amount = (shares * fxRate) / exhangeRatePrecision;
            require(amount > 0, "ZERO_STAKE");
        }

        currentPrincipal -= amount;

        // Unbond tokens
        uint256 max = ((amount * exhangeRatePrecision) / fxRate) + 1;
        matic_.sellVoucher_new(amount, max);

        // Manage Livepeer unbonding locks
        unstakeLockID = nextUnstakeLockID;
        unstakeLocks[unstakeLockID] = UnstakeLock({ amount: amount, account: _account });
        nextUnstakeLockID = unstakeLockID + 1;

        emit Unstake(_account, address(matic_), amount, unstakeLockID);
    }

    function _withdraw(address _account, uint256 _unstakeID) internal override {
        UnstakeLock storage lock = unstakeLocks[_unstakeID];
        address account = lock.account;
        uint256 amount = lock.amount;

        require(account == _account, "ACCOUNT_MISTMATCH");
        // Check that a withdrawal is pending
        require(amount > 0, "ZERO_AMOUNT");

        // Remove it from the locks
        delete unstakeLocks[_unstakeID];

        // Withdraw stake, transfers steak tokens to address(this)
        matic.unstakeClaimTokens_new(_unstakeID);

        // Transfer amount from unbondingLock to _account
        steak.transfer(account, amount);

        emit Withdraw(account, amount, _unstakeID);
    }

    function _claimRewards() internal override {
        // restake to compound rewards

        try matic.restake() {} catch {}

        // calculate rewards and fees
        uint256 rewards;
        uint256 stake;

        uint256 shares = matic.balanceOf(address(this));
        stake = (shares * _getExchangeRate(matic)) / _getExchangeRatePrecision(matic);

        uint256 currentPrincipal_ = currentPrincipal;

        if (stake >= currentPrincipal_) {
            rewards = stake - currentPrincipal_ - pendingFees - pendingLiquidityFees;
        }
        // Substract protocol fee amount and add it to pendingFees
        uint256 _pendingFees = pendingFees + MathUtils.percOf(rewards, protocolFee);
        pendingFees = _pendingFees;
        uint256 _liquidityFees = pendingLiquidityFees + MathUtils.percOf(rewards, liquidityFee);
        pendingLiquidityFees = _liquidityFees;
        // Add current pending stake minus fees and set it as current principal
        currentPrincipal = stake - _pendingFees - _liquidityFees;

        emit RewardsClaimed(rewards, currentPrincipal, currentPrincipal_);
    }

    function _totalStakedTokens() internal view override returns (uint256) {
        return currentPrincipal;
    }

    function _setStakingContract(address _stakingContract) internal override {
        maticStakeManager = _stakingContract;

        emit GovernanceUpdate("STAKING_CONTRACT");
    }

    function _getExchangeRatePrecision(IMatic _matic) internal view returns (uint256) {
        return _matic.validatorId() < 8 ? EXCHANGE_RATE_PRECISION : EXCHANGE_RATE_PRECISION_HIGH;
    }

    function _getExchangeRate(IMatic _matic) internal view returns (uint256) {
        uint256 rate = _matic.exchangeRate();
        return rate == 0 ? 1 : rate;
    }
}
