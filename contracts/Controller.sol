// // SPDX-FileCopyrightText: 2020 Tenderize <info@tenderize.me>

// // SPDX-License-Identifier: GPL-3.0

// /* See contracts/COMPILERS.md */
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
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
        // Transfer tokens to tenderizer
        require(
            steak.transferFrom(msg.sender, address(tenderizer), _amount),
            "STEAK_TRANSFERFROM_FAILED"
        );

        // mint tenderTokens
        require(
            tenderToken.mint(msg.sender, _amount),
            "TENDER_MINT_FAILED"
        );

        _updateTotalPooledTokens();
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

        // Transfer tokens after withdrawing from the tenderizer
        require(
            steak.transfer(msg.sender, _amount),
            "TRANSFER_FAILED"
        );
    }

    function rebase() public onlyOwner {
        // claim rewards
        tenderizer.claimRewards();

        // update total pooled tokens
        _updateTotalPooledTokens();

        // Resync weight for tenderToken
        // try esp.resyncWeight(address(tenderToken)) {

        // } catch {
        //     // No-op
        // }

    }

    function gulp() public {
        // gulp steak balance of Tenderizer and stake it
        tenderizer.stake(address(0), (0));
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

    function _updateTotalPooledTokens() internal {
        // get total staked tokens
        uint256 stakedTokens = tenderizer.totalStakedTokens();

        // Set total pooled tokens, rebases tenderToken supply
        tenderToken.setTotalPooledTokens(stakedTokens);
    }
    // TODO:
    // - Migrate to new tenderizer
    // - Set Esp
    // Remove setConfig and Config
    // Add rescuefunds to tenderizer:
}
