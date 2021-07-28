// // SPDX-FileCopyrightText: 2020 Tenderize <info@tenderize.me>

// // SPDX-License-Identifier: GPL-3.0

// /* See contracts/COMPILERS.md */
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./token/ITenderToken.sol";
import "./tenderizer/ITenderizer.sol";
import "./liquidity/IElasticSupplyPool.sol";
import "./liquidity/ITenderFarm.sol";

/**
 * @title Controller contract for a Tenderizer
 */

contract Controller is Ownable, ReentrancyGuard {
    IERC20 public steak;
    ITenderizer public tenderizer;
    ITenderToken public tenderToken;
    IElasticSupplyPool public esp;
    ITenderFarm public tenderFarm;

    constructor(
        IERC20 _steak,
        ITenderizer _tenderizer,
        ITenderToken _tenderToken,
        IElasticSupplyPool _esp
    ) {
        steak = _steak;
        tenderizer = _tenderizer;
        // TODO: consider deploying these contracts using factories and proxies
        // from the constructutor so that deploying a new system is only deploying a single contract
        tenderToken = _tenderToken;
        esp = _esp;
    }

    /**
     * @notice Deposit tokens in Tenderizer to earn staking rewards
     * @param _amount amount deposited
     * @dev calls Tenderizer to deposit tokens and updates total pooled tokens
     * @dev equal amount of tenderTokens are minted for the caller
     * @dev requires '_amount' to be approved by '_from'
     */
    function deposit(uint256 _amount) public {
        require(_amount > 0, "ZERO_AMOUNT");

        // mint tenderTokens
        require(tenderToken.mint(msg.sender, _amount), "TENDER_MINT_FAILED");

        tenderizer.deposit(msg.sender, _amount);

        _updateTotalPooledTokens();

        // Transfer tokens to tenderizer
        require(steak.transferFrom(msg.sender, address(tenderizer), _amount), "STEAK_TRANSFERFROM_FAILED");
    }

    /**
     * @notice Unlock staked tokens
     * @param _amount amount deposited
     * @return unstakeLockID 
     * @dev calls Tenderizer to unstake tokens and updates total pooled tokens
     * @dev equal amount of tenderTokens are burned from the user
     * @dev unstaking functionality varies by the protocol, check tenderizer.unstake()
     */
    function unlock(uint256 _amount) public nonReentrant returns (uint256 unstakeLockID) {
        require(_amount > 0, "ZERO_AMOUNT");
        // Burn tenderTokens
        require(tenderToken.burn(msg.sender, _amount), "TENDER_BURN_FAILED");

        // Unstake tokens for pending withdrawal
        unstakeLockID = tenderizer.unstake(msg.sender, _amount);

        // update total pooled tokens
        _updateTotalPooledTokens();
    }

    /**
     * @notice Withdraws unstaked tokens
     * @param _unstakeLockID lockID of the unstake
     * @dev tokens need to be unstaked before they can be withdrawn
     * @dev caller address should match the user address in lock
     */
    function withdraw(uint256 _unstakeLockID) public nonReentrant {
        require(_unstakeLockID > 0, "ZERO_AMOUNT");
        // Execute pending withdrawal
        // Reverts if unthawing period hasn't ended
        tenderizer.withdraw(msg.sender, _unstakeLockID);
    }

    /**
     * @notice Rebase will stake pending deposits, claim rewards, 
     resync the liquidity pool and collect fees
     * @dev only callable by owner(gov)
     */
    function rebase() public nonReentrant {
        // stake tokens
        gulp();

        // claim rewards
        tenderizer.claimRewards();

        // update total pooled tokens
        _updateTotalPooledTokens();

        // Collect governance fees
        _collectFees();
        // Collect LP fees
        _collectLiquidityFees();

        // Resync weight for tenderToken
        try esp.resyncWeight(address(tenderToken)) {} catch {
            // No-op
        }
    }

    /**
     * @notice Gulp stakes any unstaked token balance held by the Tenderizer
     * @dev deposit() only aggregates stake in the tenderizer, while gulp
     will perform the actual stake call
     * @dev only callable by owner(gov)
     */
    function gulp() public {
        // gulp steak balance of Tenderizer and stake it
        try tenderizer.stake(address(0), 0) {} catch {}
    }

    /**
     * @notice Collect pending protocol fees from Tenderizer
     * @dev mints equal number of tender tokens to the owner
     * @dev only callable by owner(gov)
     */
    function collectFees() public onlyOwner {
        _collectFees();
    }

    /**
     * @notice Collect pending liquidity provider fees from Tenderizer
     * @dev mints equal number of tender tokens to the tenderFarm
     * @dev only callable by owner(gov)
     */
    function collectLiquidityFees() public onlyOwner {
        _collectLiquidityFees();
    }

    /**
     * @notice Set Elastic Supply Pool contract
     * @param _esp Elastic Supply Pool contract address
     * @dev only callable by owner(gov)
     */
    function setEsp(IElasticSupplyPool _esp) public onlyOwner {
        require(address(_esp) != address(0), "ZERO_ADDRESS");
        esp = _esp;
    }

    function migrateToNewTenderizer(ITenderizer _tenderizer) public onlyOwner {}

    /**
     * @notice Set staking contract
     * @param _stakingContract staking contract address
     * @dev only callable by owner(gov)
     */
    // TODO: Remove this now that we have execute()?
    function updateStakingContract(address _stakingContract) public onlyOwner { 
        tenderizer.setStakingContract(_stakingContract);
    }

    /**
     * @notice Set TenderFarm contract
     * @param _tenderFarm TenderFarm contract address
     * @dev only callable by owner(gov)
     */
    function setTenderFarm(ITenderFarm _tenderFarm) public onlyOwner {
        tenderFarm = _tenderFarm;
    }

    /**
     * @notice Exectutes a transaction on behalf of the controller
     * @param _target target address for the contract call
     * @param _value ether value to be transeffered with the transaction
     * @param _data call data - check ethers.interface.encodeFunctionData()
     * @dev only callable by owner(gov)
     */
    function execute(
        address _target,
        uint256 _value,
        bytes calldata _data
    ) public onlyOwner {
        _execute(_target, _value, _data);
    }

    /**
     * @notice Exectutes a batch of transaction on behalf of the controller
     * @param _targets array of target addresses for the contract call
     * @param _values array of ether values to be transeffered with the transactions
     * @param _datas array of call datas - check ethers.interface.encodeFunctionData()
     * @dev Every target to its value, data via it's corresponding index
     * @dev only callable by owner(gov)
     */
    function batchExecute(
        address[] calldata _targets,
        uint256[] calldata _values,
        bytes[] calldata _datas
    ) public onlyOwner {
        require(_targets.length == _values.length && _targets.length == _datas.length, "INVALID_ARGUMENTS");
        for (uint256 i = 0; i < _targets.length; i++) {
            _execute(_targets[i], _values[i], _datas[i]);
        }
    }

    function _execute(
        address _target,
        uint256 _value,
        bytes calldata _data
    ) internal {
        (bool success, bytes memory returnData) = _target.call{ value: _value }(_data);
        require(success, string(returnData));
    }

    function _updateTotalPooledTokens() internal {
        // get total staked tokens
        uint256 stakedTokens = tenderizer.totalStakedTokens();

        // Set total pooled tokens, rebases tenderToken supply
        tenderToken.setTotalPooledTokens(stakedTokens);
    }

    function _collectFees() internal {
        // collect fees and get amount
        uint256 amount = tenderizer.collectFees();

        // mint tenderToken to fee distributor (governance)
        tenderToken.mint(owner(), amount);
    }

    function _collectLiquidityFees() internal {
        if (tenderFarm.nextTotalStake() == 0) return;
        // collect fees and get amount
        uint256 amount = tenderizer.collectLiquidityFees();

        // mint tenderToken to fee distributor (governance)
        tenderToken.mint(address(this), amount);
        tenderToken.approve(address(tenderFarm), amount);
        tenderFarm.addRewards(amount);
    }
}
