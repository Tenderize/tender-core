// // SPDX-FileCopyrightText: 2020 Tenderize <info@tenderize.me>

// // SPDX-License-Identifier: GPL-3.0

// /* See contracts/COMPILERS.md */
pragma solidity ^0.8.0;

import "./NamedToken.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "hardhat/console.sol";


/**
 * @title Interest-bearing ERC20-like token for Tenderize protocol.
 *
 * This contract is abstract. To make the contract deployable override the
 * `_getTotalPooledTokens` function. `Lido.sol` contract inherits TenderToken and defines
 * the `_getTotalPooledTokens` function.
 *
 * TenderToken balances are dynamic and represent the holder's share in the total amount
 * of Tokens controlled by the protocol. Account shares aren't normalized, so the
 * contract also stores the sum of all shares to calculate each account's token balance
 * which equals to:
 *
 *   shares[account] * _getTotalPooledTokens() / _getTotalShares()
 *
 * For example, assume that we have:
 *
 *   _getTotalPooledTokens() -> 10 Tokens
 *   sharesOf(user1) -> 100
 *   sharesOf(user2) -> 400
 *
 * Therefore:
 *
 *   balanceOf(user1) -> 2 tokens which corresponds 2 Tokens
 *   balanceOf(user2) -> 8 tokens which corresponds 8 Tokens
 *
 * Since balances of all token holders change when the amount of total pooled Tokens
 * changes, this token cannot fully implement ERC20 standard: it only emits `Transfer`
 * events upon explicit transfer between holders. In contrast, when total amount of
 * pooled Tokens increases, no `Transfer` events are generated: doing so would require
 * emitting an event for each token holder and thus running an unbounded loop.
 *
 * The token inherits from `Pausable` and uses `whenNotStopped` modifier for mTokensods
 * which change `shares` or `allowances`. `_stop` and `_resume` functions are overriden
 * in `Lido.sol` and might be called by an account with the `PAUSE_ROLE` assigned by the
 * DAO. This is useful for emergency scenarios, e.g. a protocol bug, where one might want
 * to freeze all token transfers and approvals until the emergency is resolved.
 */
contract TenderToken is NamedToken, Ownable, IERC20 {
    using SafeMath for uint256;
    // using UnstructuredStorage for bytes32;

    /**
     * @dev TenderToken balances are dynamic and are calculated based on the accounts' shares
     * and the total amount of Tokens controlled by the protocol. Account shares aren't
     * normalized, so the contract also stores the sum of all shares to calculate
     * each account's token balance which equals to:
     *
     *   shares[account] * _getTotalPooledTokens() / _getTotalShares()
    */
    mapping (address => uint256) private shares;

    /**
     * @dev Allowances are nominated in tokens, not token shares.
     */
    mapping (address => mapping (address => uint256)) private allowances;

    uint8 internal constant DECIMALS = 18;

    uint256 private totalShares;

    uint256 private totalPooledTokens;

    constructor(string memory _name, string memory _symbol) NamedToken(
            string(abi.encodePacked("tender ", _name)),
            string(abi.encodePacked("t", _symbol))
    ) {}

    /**
     * @return the number of decimals for getting user representation of a token amount.
     */
    function decimals() public pure returns (uint8) {
        return DECIMALS;
    }

    /**
     * @return the amount of tokens in existence.
     *
     * @dev Always equals to `_getTotalPooledTokens()` since token amount
     * is pegged to the total amount of Tokens controlled by the protocol.
     */
    function totalSupply() external override view returns (uint256) {
        return _getTotalPooledTokens();
    }

    /**
     * @return the entire amount of Tokens controlled by the protocol.
     *
     * @dev The sum of all Tokens balances in the protocol, equals to the total supply of TenderToken.
     */
    function getTotalPooledTokens() public view returns (uint256) {
        return _getTotalPooledTokens();
    }

    /**
     * @return the amount of tokens owned by the `_account`.
     *
     * @dev Balances are dynamic and equal the `_account`'s share in the amount of the
     * total Tokens controlled by the protocol. See `sharesOf`.
     */
    function balanceOf(address _account) external override view returns (uint256) {
        return getPooledTokensByShares(_sharesOf(_account));
    }

    /**
     * @notice Moves `_amount` tokens from the caller's account to the `_recipient` account.
     *
     * @return a boolean value indicating whTokens the operation succeeded.
     * Emits a `Transfer` event.
     *
     * Requirements:
     *
     * - `_recipient` cannot be the zero address.
     * - the caller must have a balance of at least `_amount`.
     * - the contract must not be paused.
     *
     * @dev The `_amount` argument is the amount of tokens, not shares.
     */
    function transfer(address _recipient, uint256 _amount) external override returns (bool) {
        _transfer(msg.sender, _recipient, _amount);
        return true;
    }

    /**
     * @return the remaining number of tokens that `_spender` is allowed to spend
     * on behalf of `_owner` through `transferFrom`. This is zero by default.
     *
     * @dev This value changes when `approve` or `transferFrom` is called.
     */
    function allowance(address _owner, address _spender) external override view returns (uint256) {
        return allowances[_owner][_spender];
    }

    /**
     * @notice Sets `_amount` as the allowance of `_spender` over the caller's tokens.
     *
     * @return a boolean value indicating whTokens the operation succeeded.
     * Emits an `Approval` event.
     *
     * Requirements:
     *
     * - `_spender` cannot be the zero address.
     * - the contract must not be paused.
     *
     * @dev The `_amount` argument is the amount of tokens, not shares.
     */
    function approve(address _spender, uint256 _amount) external override returns (bool) {
        _approve(msg.sender, _spender, _amount);
        return true;
    }

    /**
     * @notice Moves `_amount` tokens from `_sender` to `_recipient` using the
     * allowance mechanism. `_amount` is then deducted from the caller's
     * allowance.
     *
     * @return a boolean value indicating whTokens the operation succeeded.
     *
     * Emits a `Transfer` event.
     * Emits an `Approval` event indicating the updated allowance.
     *
     * Requirements:
     *
     * - `_sender` and `_recipient` cannot be the zero addresses.
     * - `_sender` must have a balance of at least `_amount`.
     * - the caller must have allowance for `_sender`'s tokens of at least `_amount`.
     * - the contract must not be paused.
     *
     * @dev The `_amount` argument is the amount of tokens, not shares.
     */
    function transferFrom(address _sender, address _recipient, uint256 _amount) external override returns (bool) {
        uint256 currentAllowance = allowances[_sender][msg.sender];
        require(currentAllowance >= _amount, "TRANSFER_AMOUNT_EXCEEDS_ALLOWANCE");

        _transfer(_sender, _recipient, _amount);
        _approve(_sender, msg.sender, currentAllowance.sub(_amount));
        return true;
    }

    /**
     * @notice Atomically increases the allowance granted to `_spender` by the caller by `_addedValue`.
     *
     * This is an alternative to `approve` that can be used as a mitigation for
     * problems described in:
     * https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/IERC20.sol#L42
     * Emits an `Approval` event indicating the updated allowance.
     *
     * Requirements:
     *
     * - `_spender` cannot be the the zero address.
     * - the contract must not be paused.
     */
    function increaseAllowance(address _spender, uint256 _addedValue) public returns (bool) {
        _approve(msg.sender, _spender, allowances[msg.sender][_spender].add(_addedValue));
        return true;
    }

    /**
     * @notice Atomically decreases the allowance granted to `_spender` by the caller by `_subtractedValue`.
     *
     * This is an alternative to `approve` that can be used as a mitigation for
     * problems described in:
     * https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/IERC20.sol#L42
     * Emits an `Approval` event indicating the updated allowance.
     *
     * Requirements:
     *
     * - `_spender` cannot be the zero address.
     * - `_spender` must have allowance for the caller of at least `_subtractedValue`.
     * - the contract must not be paused.
     */
    function decreaseAllowance(address _spender, uint256 _subtractedValue) public returns (bool) {
        uint256 currentAllowance = allowances[msg.sender][_spender];
        require(currentAllowance >= _subtractedValue, "DECREASED_ALLOWANCE_BELOW_ZERO");
        _approve(msg.sender, _spender, currentAllowance.sub(_subtractedValue));
        return true;
    }

    function mint(address _recipient, uint256 _amount) public onlyOwner returns (bool) {
        uint256 _totalPooledTokens = _getTotalPooledTokens();
        if (_totalPooledTokens == 0) {
            _mintShares(_recipient, _amount);
        } else {
            uint256 _sharesToMint = getSharesByPooledTokens(_amount);
            _mintShares(_recipient, _sharesToMint);
        }
        _setTotalPooledTokens(totalPooledTokens.add(_amount));
        return true;
    }

    function burn(address _account, uint256 _amount) public onlyOwner returns (bool) {
        uint256 _sharesToburn = getSharesByPooledTokens(_amount);
        _burnShares(_account, _sharesToburn);
        _setTotalPooledTokens(totalPooledTokens.sub(_amount));
        return true;
    }

    function setTotalPooledTokens(uint256 _newTotalPooledTokens) public onlyOwner {
        _setTotalPooledTokens(_newTotalPooledTokens);
    }

    /**
     * @return the total amount of shares in existence.
     *
     * @dev The sum of all accounts' shares can be an arbitrary number, therefore
     * it is necessary to store it in order to calculate each account's relative share.
     */
    function getTotalShares() public view returns (uint256) {
        return _getTotalShares();
    }

    /**
     * @return the amount of shares owned by `_account`.
     */
    function sharesOf(address _account) public view returns (uint256) {
        return _sharesOf(_account);
    }

    /**
     * @return the amount of shares that corresponds to `_TokensAmount` protocol-controlled Tokens.
     */
    function getSharesByPooledTokens(uint256 _TokensAmount) public view returns (uint256) {
        uint256 _totalPooledTokens = _getTotalPooledTokens();
        uint256 _totalShares = _getTotalShares();
        if (_totalPooledTokens == 0) {
            return 0;
        } else if (_totalShares == 0) {
            return _TokensAmount;
        } else {
            return _TokensAmount
                .mul(_totalShares)
                .div(_totalPooledTokens);
        }
    }

    /**
     * @return the amount of Tokens that corresponds to `_sharesAmount` token shares.
     */
    function getPooledTokensByShares(uint256 _sharesAmount) public view returns (uint256) {
        uint256 currShares = _getTotalShares();
        if (currShares == 0) {
            return 0;
        } else {
            return _sharesAmount
                .mul(_getTotalPooledTokens())
                .div(currShares);
        }
    }

    /**
     * @return the total amount (in 10e18) of Tokens controlled by the protocol.
     * @dev This is used for calculating tokens from shares and vice versa.
     * @dev This function is required to be implemented in a derived contract.
     */
    function _getTotalPooledTokens() internal view returns (uint256) {
        return totalPooledTokens;
    }

    /**
    * @dev update the total amount (in 10e18) of Tokens controlled by the protocol.
    */
    function _setTotalPooledTokens(uint256 _newTotalPooledTokens) internal {
        totalPooledTokens = _newTotalPooledTokens;
    }

    /**
     * @notice Moves `_amount` tokens from `_sender` to `_recipient`.
     * Emits a `Transfer` event.
     */
    function _transfer(address _sender, address _recipient, uint256 _amount) internal {
        uint256 _sharesToTransfer = getSharesByPooledTokens(_amount);
        _transferShares(_sender, _recipient, _sharesToTransfer);
        emit Transfer(_sender, _recipient, _amount);
    }

    /**
     * @notice Sets `_amount` as the allowance of `_spender` over the `_owner` s tokens.
     *
     * Emits an `Approval` event.
     *
     * Requirements:
     *
     * - `_owner` cannot be the zero address.
     * - `_spender` cannot be the zero address.
     * - the contract must not be paused.
     */
    function _approve(address _owner, address _spender, uint256 _amount) internal {
        require(_owner != address(0), "APPROVE_FROM_ZERO_ADDRESS");
        require(_spender != address(0), "APPROVE_TO_ZERO_ADDRESS");

        allowances[_owner][_spender] = _amount;
        emit Approval(_owner, _spender, _amount);
    }

    /**
     * @return the total amount of shares in existence.
     */
    function _getTotalShares() internal view returns (uint256) {
        return totalShares;
    }

    /**
     * @return the amount of shares owned by `_account`.
     */
    function _sharesOf(address _account) internal view returns (uint256) {
        return shares[_account];
    }

    /**
     * @notice Moves `_sharesAmount` shares from `_sender` to `_recipient`.
     *
     * Requirements:
     *
     * - `_sender` cannot be the zero address.
     * - `_recipient` cannot be the zero address.
     * - `_sender` must hold at least `_sharesAmount` shares.
     * - the contract must not be paused.
     */
    function _transferShares(address _sender, address _recipient, uint256 _sharesAmount) internal {
        require(_sender != address(0), "TRANSFER_FROM_THE_ZERO_ADDRESS");
        require(_recipient != address(0), "TRANSFER_TO_THE_ZERO_ADDRESS");

        uint256 currentSenderShares = shares[_sender];
        console.log("current sender shares %s", currentSenderShares);
        console.log("Shares amount to transfer %s", _sharesAmount);
        require(_sharesAmount <= currentSenderShares, "TRANSFER_AMOUNT_EXCEEDS_BALANCE");

        shares[_sender] = currentSenderShares.sub(_sharesAmount);
        shares[_recipient] = shares[_recipient].add(_sharesAmount);
    }

    /**
     * @notice Creates `_sharesAmount` shares and assigns them to `_recipient`, increasing the total amount of shares.
     * @dev This doesn't increase the token total supply.
     *
     * Requirements:
     *
     * - `_recipient` cannot be the zero address.
     * - the contract must not be paused.
     */
    function _mintShares(address _recipient, uint256 _sharesAmount) internal returns (uint256 newTotalShares) {
        require(_recipient != address(0), "MINT_TO_THE_ZERO_ADDRESS");

        newTotalShares = totalShares.add(_sharesAmount);

        shares[_recipient] = shares[_recipient].add(_sharesAmount);

        // Notice: we're not emitting a Transfer event from the zero address here since shares mint
        // works by taking the amount of tokens corresponding to the minted shares from all other
        // token holders, proportionally to their share. The total supply of the token doesn't change
        // as the result. This is equivalent to performing a send from each other token holder's
        // address to `address`, but we cannot reflect this as it would require sending an unbounded
        // number of events.
        totalShares = newTotalShares;
    }

    /**
     * @notice Destroys `_sharesAmount` shares from `_account`'s holdings, decreasing the total amount of shares.
     * @dev This doesn't decrease the token total supply.
     *
     * Requirements:
     *
     * - `_account` cannot be the zero address.
     * - `_account` must hold at least `_sharesAmount` shares.
     * - the contract must not be paused.
     */
    function _burnShares(address _account, uint256 _sharesAmount) internal returns (uint256 newTotalShares) {
        require(_account != address(0), "BURN_FROM_THE_ZERO_ADDRESS");

        uint256 accountShares = shares[_account];
        require(_sharesAmount <= accountShares, "BURN_AMOUNT_EXCEEDS_BALANCE");

        newTotalShares = totalShares.sub(_sharesAmount);

        shares[_account] = accountShares.sub(_sharesAmount);

        // Notice: we're not emitting a Transfer event to the zero address here since shares burn
        // works by redistributing the amount of tokens corresponding to the burned shares between
        // all other token holders. The total supply of the token doesn't change as the result.
        // This is equivalent to performing a send from `address` to each other token holder address,
        // but we cannot reflect this as it would require sending an unbounded number of events.
        totalShares = newTotalShares;
    }
}
