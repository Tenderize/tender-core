// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "../tenderizer/WithdrawalLocks.sol";

contract DummyStaking is ERC20, ERC20Permit {
    using WithdrawalLocks for WithdrawalLocks.Locks;

    WithdrawalLocks.Locks withdrawalLocks;

    uint256 public totalStaked;

    /**
     * @dev Constructor that gives msg.sender all of existing tokens.
     */
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply
    ) ERC20(name, symbol) ERC20Permit(name) {
        _mint(msg.sender, initialSupply);
    }

    function stake(
        uint256 _amount,
        address /*_node*/
    ) public {
        totalStaked += _amount;
        ERC20(address(this)).transferFrom(msg.sender, address(this), _amount);
    }

    function unstake(
        uint256 _amount,
        address /*_node*/
    ) public {
        totalStaked -= _amount;
        uint256 lockID = withdrawalLocks.unlock(msg.sender, _amount);
    }

    function withdraw(uint256 _withdrawalLockID) public {
        uint256 amountWithdrawn = withdrawalLocks.withdraw(msg.sender, _withdrawalLockID);
        ERC20(address(this)).transfer(msg.sender, amountWithdrawn);
    }

    function addRewards(uint256 _amount) external {
        totalStaked += _amount;
        _mint(address(this), _amount);
    }

    function slash(uint256 _amount) external {
        totalStaked -= _amount;
        _burn(address(this), _amount);
    }
}
