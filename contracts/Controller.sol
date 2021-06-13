// // SPDX-FileCopyrightText: 2020 Tenderize <info@tenderize.me>

// // SPDX-License-Identifier: GPL-3.0

// /* See contracts/COMPILERS.md */
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./token/ITenderToken.sol";
import "./tenderizer/ITenderizer.sol";
import "./liquidity/IElasticSupplyPool.sol";

/**
 * @title Controller contract for a Tenderizer
 */

contract Controller is Ownable {

    IERC20 public steak;
    ITenderizer public tenderizer;
    ITenderToken public tenderToken;
    IElasticSupplyPool public esp;

    constructor(IERC20 _steak, ITenderizer _tenderizer, ITenderToken _tenderToken, IElasticSupplyPool _esp) {
        steak = _steak;
        tenderizer = _tenderizer;
        // TODO: consider deploying these contracts using factories and proxies
        // from the constructutor so that deploying a new system is only deploying a single contract
        tenderToken = _tenderToken;
        esp = _esp;
    }

    function deposit(uint256 _amount) public {
        require(_amount > 0, "ZERO_AMOUNT");

        // mint tenderTokens
        require(
            tenderToken.mint(msg.sender, _amount),
            "TENDER_MINT_FAILED"
        );

        tenderizer.deposit(msg.sender, _amount);

        _updateTotalPooledTokens();

        // Transfer tokens to tenderizer
        require(
            steak.transferFrom(msg.sender, address(tenderizer), _amount),
            "STEAK_TRANSFERFROM_FAILED"
        );
    }

    function unlock(uint256 _amount) public {
        require(_amount > 0, "ZERO_AMOUNT");
        // Burn tenderTokens
        require(
            tenderToken.burn(msg.sender, _amount),
            "TENDER_BURN_FAILED"
        );

        // update total pooled tokens
        _updateTotalPooledTokens();

        // Unstake tokens for pending withdrawal
        tenderizer.unstake(msg.sender, _amount);
    }

    function withdraw(uint256 _amount) public {
        require(_amount > 0, "ZERO_AMOUNT");
        // Execute pending withdrawal
        // Reverts if unthawing period hasn't ended
        tenderizer.withdraw(msg.sender, _amount);
    }

    function rebase() public onlyOwner {
        // stake tokens
        gulp();

        // claim rewards
        tenderizer.claimRewards();

        // update total pooled tokens
        _updateTotalPooledTokens();

        // Resync weight for tenderToken
        try esp.resyncWeight(address(tenderToken)) {

        } catch {
            // No-op
        }

    }

    function gulp() public {
        // gulp steak balance of Tenderizer and stake it
        tenderizer.stake(address(0), 0);
    }

    function collectFees() public onlyOwner {
        // collect fees and get amount
        uint256 amount = tenderizer.collectFees();

        // mint tenderToken to fee distributor (governance)
        tenderToken.mint(owner(), amount);
    }

    function setEsp(IElasticSupplyPool _esp) public onlyOwner {
        require(address(_esp) != address(0), "ZERO_ADDRESS");
        esp = _esp;
    }

    function migrateToNewTenderizer(ITenderizer _tenderizer) public onlyOwner {
        
    }

    function updateStakingContract(address _stakingContract) public onlyOwner {
        tenderizer.setStakingContract(_stakingContract);
    }

    function execute (address _target, uint256 _value, bytes calldata _data) public onlyOwner {
        _execute(_target, _value, _data);
    }

    function batchExecute(address[] calldata _targets, uint256[] calldata _values, bytes[] calldata _datas) public onlyOwner {
        require(_targets.length == _values.length && _targets.length == _datas.length, "INVALID_ARGUMENTS");
        for (uint256 i = 0; i < _targets.length; i++) {
            _execute(_targets[i], _values[i], _datas[i]);
        }
    }

    function _execute(address _target, uint256 _value, bytes calldata _data) internal {
        (bool success, bytes memory returnData) = _target.call{value: _value}(_data);
        require(success, string(returnData));
    }

    function _updateTotalPooledTokens() internal {
        // get total staked tokens
        uint256 stakedTokens = tenderizer.totalStakedTokens();

        // Set total pooled tokens, rebases tenderToken supply
        tenderToken.setTotalPooledTokens(stakedTokens);
    }
    // TODO:
    // Add rescuefunds to tenderizer:
}
