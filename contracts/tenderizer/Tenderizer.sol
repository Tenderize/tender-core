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

    IERC20 public steak;
    address public node; 

    // TODO: Make governance param
    uint256 public protocolFee = 25 * 10 **16; // 2.5%
    // TODO: Make constant
    uint256 perc_divisor = 1*10**18;

    uint256 public pendingFees; // pending protocol fees since last distribution
    uint256 public currentPrincipal; // Principal since last claiming earnings

    constructor(IERC20 _steak, address _node) {
        steak = _steak;
        node = _node;
    }

    function stake(address _account, uint256 _amount) external override onlyOwner {
        // Execute state updates
        // approve pendingTokens for staking
        // Stake tokens
        _stake(_account, _amount);
    }

    function unstake(address _account, uint256 _amount) external override onlyOwner {
        // Execute state updates to pending withdrawals
        // Unstake tokens
        _unstake(_account, address(0), _amount);
    }

    function withdraw(address _account, uint256 _amount) external override onlyOwner {
        // Execute state updates to pending withdrawals
        // Transfer tokens to _account
        _withdraw(_account, _amount);
    }

    function claimRewards() external override onlyOwner {
        // Claim rewards
        // If received staking rewards in steak don't automatically compound, add to pendingTokens
        // Swap tokens with address != steak to steak
        // Add steak from swap to pendingTokens
        _claimRewards();
    }

    function setNode(address _node) external onlyOwner {
        require(_node != address(0), "ZERO_ADDRESS");
        node = _node;
    }

    function setSteak(IERC20 _steak) external onlyOwner {
        require(address(_steak) != address(0), "ZERO_ADDRESS");
        steak = _steak;
    }

    function setProtocolFee(uint256 _protocolFee) external onlyOwner {
        protocolFee = _protocolFee;
    }

    function collectFees() external override onlyOwner returns (uint256) {
        _collectFees();
    }

    function totalStakedTokens() external override view returns (uint256) {
        return _totalStakedTokens();
    }

    function _stake(address _account, uint256 _amount) internal virtual;

    function _unstake(address _account, address _node, uint256 _amount) internal virtual;

    function _withdraw(address _account, uint256 _amount) internal virtual;

    function _claimRewards() internal virtual;

    function _collectFees() internal virtual returns (uint256);

    function _totalStakedTokens() internal virtual view returns (uint256);

}