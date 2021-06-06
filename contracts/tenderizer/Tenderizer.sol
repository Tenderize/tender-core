// // SPDX-FileCopyrightText: 2020 Tenderize <info@tenderize.me>

// // SPDX-License-Identifier: GPL-3.0

// /* See contracts/COMPILERS.md */
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./ITenderizer.sol";

abstract contract Tenderizer is Ownable, ITenderizer {
    using SafeMath for uint256;

    address constant ZERO_ADDRESS = address(0);

    IERC20 public steak;
    address public node; 

    uint256 public protocolFee = 25 * 1e15; // 2.5% because PERC DIVISOR = 1e18

    uint256 public pendingFees; // pending protocol fees since last distribution
    uint256 public currentPrincipal; // Principal since last claiming earnings

    constructor(IERC20 _steak, address _node) {
        steak = _steak;
        node = _node;
    }

    /**
     * @notice Deposit tokens in Tenderizer
     * @param _from account that deposits
     * @param _amount amount deposited
     * @dev only callable by Controller
     * @dev doesn't actually stakes the tokens but aggregates the balance in the tenderizer
        awaiting to be staked
     * @dev requires '_amount' to be approved by '_from'
     */
    function deposit(address _from, uint256 _amount) external override onlyOwner {
        _deposit(_from, _amount);
    }

    /**
     * @notice Stake '_amount' of tokens to '_account'
     * @param _account account to stake to in the underlying protocol
     * @param _amount amount to stake
     * @dev If '_account' is not specified, stake towards the default address
     * @dev If '_amount' is 0, stake the entire current token balance of the Tenderizer
     * @dev Only callable by controller
     */
    function stake(address _account, uint256 _amount) external override onlyOwner {
        // Execute state updates
        // approve pendingTokens for staking
        // Stake tokens
        _stake(_account, _amount);
    }

    /**
     * @notice Unstake '_amount' of tokens from '_account'
     * @param _account account to unstake from in the underlying protocol
     * @param _amount amount to unstake
     * @dev If '_account' is not specified, stake towards the default address
     * @dev If '_amount' is 0, unstake the entire amount staked towards _account
     * @dev Only callable by controller
     */
    function unstake(address _account, uint256 _amount) external override onlyOwner {
        // Execute state updates to pending withdrawals
        // Unstake tokens
        _unstake(_account, address(0), _amount);
    }

    /**
     * @notice Withdraw '_amount' of tokens previously unstaked by '_account'
     * @param _account account requesting the withdrawam
     * @param _amount amount to withdraw (optional)
     * @dev If '_amount' isn't specified all unstake tokens by '_account' will be withdrawn
     * @dev Requires '_account' to have unstaked prior to calling withdraw
     * @dev Only callable by controller
     */
    function withdraw(address _account, uint256 _amount) external override onlyOwner {
        // Execute state updates to pending withdrawals
        // Transfer tokens to _account
        _withdraw(_account, _amount);
    }

    /**
     * @notice Claim staking rewards for the underlying protocol
     * @dev Only callable by controller
     */
    function claimRewards() external override onlyOwner {
        // Claim rewards
        // If received staking rewards in steak don't automatically compound, add to pendingTokens
        // Swap tokens with address != steak to steak
        // Add steak from swap to pendingTokens
        _claimRewards();
    }

    function setNode(address _node) external override onlyOwner {
        require(_node != address(0), "ZERO_ADDRESS");
        node = _node;
    }

    function setSteak(IERC20 _steak) external override  onlyOwner {
        require(address(_steak) != address(0), "ZERO_ADDRESS");
        steak = _steak;
    }

    function setProtocolFee(uint256 _protocolFee) external override onlyOwner {
        protocolFee = _protocolFee;
    }

    function setStakingContract(address _stakingContract) external override onlyOwner {
        _setStakingContract(_stakingContract);
    }

    function collectFees() external override onlyOwner returns (uint256) {
        return _collectFees();
    }

    function totalStakedTokens() external override view returns (uint256) {
        return _totalStakedTokens();
    }

    function _deposit(address _account, uint256 _amount) internal virtual;

    function _stake(address _account, uint256 _amount) internal virtual;

    function _unstake(address _account, address _node, uint256 _amount) internal virtual;

    function _withdraw(address _account, uint256 _amount) internal virtual;

    function _claimRewards() internal virtual;

    function _collectFees() internal virtual returns (uint256);

    function _totalStakedTokens() internal virtual view returns (uint256);

    // Internal governance functions 
    function _setStakingContract(address _stakingContract) internal virtual; 
}