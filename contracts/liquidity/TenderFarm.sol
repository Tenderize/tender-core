// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "../libs/MathUtils.sol";
import "../token/ITenderToken.sol";

contract TenderFarm is Ownable {
    event Farm(address indexed account, uint256 amount);
    event Unfarm(address indexed account, uint256 amount);
    event Harvest(address indexed account, uint256 amount);
    event RewardsAdded(uint256 amount);

    IERC20 public token; // LP token
    ITenderToken public rewardToken; // tender token

    uint256 public totalStake; // total amount of LP tokens staked
    uint256 public nextTotalStake;
    uint256 public CRF; // cumulative reward factor

    struct Stake {
        uint256 stake;
        uint256 lastCRF;
    }

    mapping(address => Stake) public stakes;

    constructor(IERC20 _stakeToken, ITenderToken _rewardToken) {
        token = _stakeToken;
        rewardToken = _rewardToken;
    }

    /**
     * @notice stake liquidity pool tokens to receive rewards
     * @dev '_amount' needs to be approved for the 'TenderFarm' to transfer
     * @dev harvests current rewards before accounting updates are made
     * @param _amount amount of liquidity pool tokens to stake
     */
    function farm(uint256 _amount) public {
        _farmFor(msg.sender, _amount);
    }

    /**
     * @notice stake liquidity pool tokens for a specific account so that it receives rewards
     * @dev '_amount' needs to be approved for the 'TenderFarm' to transfer
     * @dev staked tokens will belong to the account they are staked for
     * @dev harvests current rewards before accounting updates are made
     * @param _for account to stake for
     * @param _amount amount of liquidity pool tokens to stake
     */
    function farmFor(address _for, uint256 _amount) public {
        _farmFor(_for, _amount);
    }

    /**
     * @notice unstake liquidity pool tokens
     * @dev '_amount' needs to be approved for the 'TenderFarm' to transfer
     * @dev harvests current rewards before accounting updates are made
     * @param _amount amount of liquidity pool tokens to stake
     */
    function unfarm(uint256 _amount) public {
        _unfarm(msg.sender, _amount);
    }

    /**
     * @notice harvest outstanding rewards
     * @dev reverts when trying to harvest multiple times if no new rewards have been added
     * @dev emits an event with how many reward tokens have been harvested
     */
    function harvest() public {
        _harvest(msg.sender);
    }

    /**
     * @notice add new rewards
     * @dev will 'start' a new 'epoch'
     * @dev only callable by owner
     * @param _amount amount of reward tokens to add
     */
    function addRewards(uint256 _amount) public onlyOwner {
        uint256 _nextStake = nextTotalStake;
        require(_nextStake > 0, "NO_STAKE");
        totalStake = _nextStake;
        uint256 shares = rewardToken.tokensToShares(_amount);
        CRF += MathUtils.percPoints(shares, _nextStake);
        require(rewardToken.transferFrom(msg.sender, address(this), _amount), "TRANSFER_FAILED");
        emit RewardsAdded(_amount);
    }

    function availableRewards(address _for) public view returns (uint256) {
        return rewardToken.sharesToTokens(_availableRewardShares(_for));
    }

    function stakeOf(address _of) public view returns (uint256) {
        return _stakeOf(_of);
    }

    function _farmFor(address _for, uint256 _amount) internal {
        _harvest(_for);

        stakes[_for].stake += _amount;
        nextTotalStake += _amount;

        require(token.transferFrom(msg.sender, address(this), _amount), "TRANSFERFROM_FAIL");

        emit Farm(_for, _amount);
    }

    function _unfarm(address _for, uint256 _amount) internal {
        Stake storage _stake = stakes[_for];
        require(_amount <= _stake.stake, "AMOUNT_EXCEEDS_STAKE");

        _harvest(_for);

        _stake.stake -= _amount;
        nextTotalStake -= _amount;

        require(token.transfer(_for, _amount), "TRANSFER_FAIL");
        emit Unfarm(_for, _amount);
    }

    function _harvest(address _for) internal {
        Stake storage _stake = stakes[_for];

        // Calculate available rewards
        uint256 rewards = _availableRewardShares(_for);

        // Checkpoint CRF
        _stake.lastCRF = CRF;

        if (rewards > 0) {
            uint256 rewardTokens = rewardToken.sharesToTokens(rewards);
            require(rewardToken.transfer(_for, rewardTokens), "TRANSFER_FAIL");
            emit Harvest(_for, rewardTokens);
        }
    }

    function _availableRewardShares(address _for) internal view returns (uint256) {
        Stake storage _stake = stakes[_for];

        if (CRF == 0) return 0;

        return MathUtils.percOf(_stake.stake, CRF - _stake.lastCRF);
    }

    function _stakeOf(address _of) internal view returns (uint256) {
        return stakes[_of].stake;
    }
}
