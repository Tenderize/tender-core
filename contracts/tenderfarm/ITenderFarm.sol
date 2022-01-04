// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../token/ITenderToken.sol";
import "../tenderizer/ITenderizer.sol";

/**
 * @title TenderFarm
 * @notice TenderFarm is responsible for incetivizing liquidity providers, by accepting LP Tokens 
 * and a proportionaly rewarding them with TenderTokens over time.
 */
interface ITenderFarm {

    event Farm(address indexed account, uint256 amount);
    event Unfarm(address indexed account, uint256 amount);
    event Harvest(address indexed account, uint256 amount);
    event RewardsAdded(uint256 amount);

    function initialize(
        IERC20 _stakeToken,
        ITenderToken _rewardToken,
        ITenderizer _tenderizer
    ) external returns (bool);

    /**
     * @notice stake liquidity pool tokens to receive rewards
     * @dev '_amount' needs to be approved for the 'TenderFarm' to transfer.
     * @dev harvests current rewards before accounting updates are made.
     * @param _amount amount of liquidity pool tokens to stake
     */
    function farm(uint256 _amount) external;

    /**
     * @notice stake liquidity pool tokens for a specific account so that it receives rewards
     * @dev '_amount' needs to be approved for the 'TenderFarm' to transfer.
     * @dev staked tokens will belong to the account they are staked for.
     * @dev harvests current rewards before accounting updates are made.
     * @param _for account to stake for
     * @param _amount amount of liquidity pool tokens to stake
     */
    function farmFor(address _for, uint256 _amount) external;

    /**
     * @notice unstake liquidity pool tokens
     * @dev '_amount' needs to be approved for the 'TenderFarm' to transfer.
     * @dev harvests current rewards before accounting updates are made.
     * @param _amount amount of liquidity pool tokens to stake
     */
    function unfarm(uint256 _amount) external;

    /**
     * @notice harvest outstanding rewards
     * @dev reverts when trying to harvest multiple times if no new rewards have been added.
     * @dev emits an event with how many reward tokens have been harvested.
     */
    function harvest() external;

    /**
     * @notice add new rewards
     * @dev will 'start' a new 'epoch'.
     * @dev only callable by owner.
     * @param _amount amount of reward tokens to add
     */
    function addRewards(uint256 _amount) external;

    /**
     * @notice Check available rewards for an address.
     * @param _for address
     * @return _amount rewards for address
     */
    function availableRewards(address _for) external view returns (uint256 _amount);

    /**
     * @notice Check stake for an address.
     * @param _of address
     * @return _amount LP tokens deposited for address
     */
    function stakeOf(address _of) external view returns (uint256 _amount);

    /**
     * @return _totalStake -  total amount of LP tokens staked
     */
    function totalStake() external view returns (uint256 _totalStake);

    /**
     * @return _nextTotalStake - LP Tokens staked for next round
     */
    function nextTotalStake() external view returns (uint256 _nextTotalStake);

    /**
     * @notice Changes the tenderizer of the contract
     * @param _tenderizer address of the new tenderizer
     */
    function setTenderizer(ITenderizer _tenderizer) external;
}
