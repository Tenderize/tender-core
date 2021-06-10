// // SPDX-FileCopyrightText: 2020 Tenderize <info@tenderize.me>

// // SPDX-License-Identifier: GPL-3.0

// /* See contracts/COMPILERS.md */
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../../libs/MathUtils.sol";

import "../../Tenderizer.sol";
import "./ILivepeer.sol";
import "../../../liquidity/IOneInch.sol";

contract Livepeer is Tenderizer {

    uint256 constant private MAX_ROUND = 2**256 - 1;

    IOneInch constant private oneInch = IOneInch(address(0));

    ILivepeer livepeer;

    struct unbondingLock {
        uint256 id;
        uint256 amount;
    }

    mapping (address => unbondingLock) unbondingLocks;
    uint256 private nextUnbondingLockID;

    uint256 constant private ethFees_threshold = 1**17;

    function initialize(IERC20 _steak, ILivepeer _livepeer, address _node) public {
        Tenderizer._initialize(_steak, _node, msg.sender);
        livepeer = _livepeer;
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

        // if no _node is specified, stake towards the default node
        address node_ = _node;
        if (node_ == address(0)) {
            node_ = node;
        }

        // approve amount to Livepeer protocol
        steak.approve(address(livepeer), amount);

        // stake tokens
        livepeer.bond(amount, node_);

        super._stake(node_, amount);
    }

    function _unstake(address _account, address _node, uint256 _amount) internal override {
        // Check that no withdrawal is pending
        require(unbondingLocks[_account].amount == 0, "PENDING_WITHDRAWAL");

        uint256 amount = _amount;
        // Sanity check. Controller already checks user deposits and withdrawals > 0
        if (_account != controller) require(amount > 0, "ZERO_AMOUNT");
        if (amount == 0) {
            amount = livepeer.pendingStake(address(this), MAX_ROUND);
            require(amount > 0, "ZERO_STAKE");
        }

        // if no _node is specified, stake towards the default node
        address node_ = _node;
        if (node_ == address(0)) {
            node_ = node;
        }

        currentPrincipal -= _amount;

        // Unbond tokens
        livepeer.unbond(_amount);

        // Manage Livepeer unbonding locks
        uint256 unbondingLockID = nextUnbondingLockID;
        nextUnbondingLockID += 1;

        unbondingLocks[_account] = unbondingLock({
            id: unbondingLockID,
            amount: _amount
        });

        super._unstake(_account, node_, _amount);
    }

    function _unstakeFromProtocol() internal override {
        // Not needed for livepeer as unstakes are handled per user
    }

    function _withdraw(address _account, uint256 /*_amount*/) internal override {
        // Check that a withdrawal is pending
        require(unbondingLocks[_account].amount > 0, "NO_PENDING_WITHDRAWAL");

        // Init storage pointer
        unbondingLock memory _unbondingLock = unbondingLocks[_account];

        // Remove it from the locks
        delete unbondingLocks[_account];

        // Withdraw stake, transfers steak tokens to address(this)
        livepeer.withdrawStake(_unbondingLock.id);

        // Transfer amount from unbondingLock to _account
        steak.transfer(_account, _unbondingLock.amount);

        super._withdraw(_account, _unbondingLock.amount);
    }

    function _withdrawFromProtocol() internal override {
        // Not needed for livepeer as withdrawals are handled per user
    }

    function _claimRewards() internal override {
        // Livepeer automatically compounds
        // The rewards is the difference between
        // pending stake and the latest cached stake amount

        // TODO: Oh god this is going to be so costly
        // What if we gulp before this call so we have the updated state in getDelegator ? bond might be more costly
        // Let's just code this with everything we need and benchmark gas

        // Account for LPT rewards
        address del = address(this);
        uint256 stake = livepeer.pendingStake(del, MAX_ROUND);
        uint256 ethFees = livepeer.pendingFees(del, MAX_ROUND);
        uint256 currentPrincipal_ = currentPrincipal;

        uint256 rewards;
        if (stake >= currentPrincipal_) {
            rewards = stake - currentPrincipal_;
        }

        // withdraw fees
        if (ethFees >= ethFees_threshold) {
            livepeer.withdrawFees();

            // swap ETH fees for LPT
            if (address(oneInch) != address(0)) {
                uint256 swapAmount = address(this).balance;
                (uint256 returnAmount, uint256[] memory distribution) = oneInch.getExpectedReturn(IERC20(address(0)), steak, swapAmount, 1, 0);
                uint256 swappedLPT = oneInch.swap(IERC20(address(0)), steak, swapAmount, returnAmount, distribution, 0);
                // Add swapped LPT to rewards
                rewards += swappedLPT;
            }
        }

        // Substract protocol fee amount and add it to pendingFees
        uint256 fee = MathUtils.percOf(rewards, protocolFee);
        pendingFees += fee;

        // Add current pending stake minus fees and set it as current principal
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
        livepeer = ILivepeer(_stakingContract);
    }

}
