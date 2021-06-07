// // SPDX-FileCopyrightText: 2020 Tenderize <info@tenderize.me>

// // SPDX-License-Identifier: GPL-3.0

// /* See contracts/COMPILERS.md */
pragma solidity ^0.8.0;

import "./NamedToken.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../libs/MathUtils.sol";

/**
 * @title Interest-bearing ERC20-like token for Tenderize protocol.
 * @author Tenderize <info@tenderize.me>
 * @dev TenderToken balances are dynamic and are calculated based on the accounts' shares
    and the total amount of Tokens controlled by the protocol. Account shares aren't
    normalized, so the contract also stores the sum of all shares to calculate
    each account's token balance which equals to:

    shares[account] * _getTotalPooledTokens() / _getTotalShares()
 */
contract TenderToken is NamedToken, Ownable, IERC20 {

    uint8 internal constant DECIMALS = 18;

    /**
     * @dev Total amount of outstanding shares
     */
    uint256 private totalShares;

    /**
     * @dev Total amount of underlying tokens pooled
     */
    uint256 private totalPooledTokens;

    /**
     * @dev Nominal amount of shares held by each account
     */
    mapping (address => uint256) private shares;

    /**
     * @dev Allowances nominated in tokens, not token shares.
     */
    mapping (address => mapping (address => uint256)) private allowances;

    constructor(string memory _name, string memory _symbol) NamedToken(
            string(abi.encodePacked("tender ", _name)),
            string(abi.encodePacked("t", _symbol))
    ) {}

    /**
     * @notice The number of decimals the TenderToken uses
     * @return the number of decimals for getting user representation of a token amount.
     */
    function decimals() public pure returns (uint8) {
        return DECIMALS;
    }

    /**
     * @notice The total supply of tender tokens in existence
     * @dev Always equals to `_getTotalPooledTokens()` since token amount
        is pegged to the total amount of Tokens controlled by the protocol.
     * @return total supply
     */
    function totalSupply() external override view returns (uint256) {
        return _getTotalPooledTokens();
    }

    /**
     * @notice Total amount of underlying tokens controlled by the Tenderizer
     * @dev The sum of all Tokens balances in the protocol, equals to the total supply of TenderToken.
     * @return total amount of pooled tokens
     */
    function getTotalPooledTokens() public view returns (uint256) {
        return _getTotalPooledTokens();
    }

    /**
     * @notice The total amount of shares in existence.
     * @dev The sum of all accounts' shares can be an arbitrary number, therefore
        it is necessary to store it in order to calculate each account's relative share.
     * @return total amount of shares
     */
    function getTotalShares() public view returns (uint256) {
        return _getTotalShares();
    }

    /**
     * @notice the amount of tokens owned by the `_account`.
     * @dev Balances are dynamic and equal the `_account`'s share in the amount of the
        total Tokens controlled by the protocol. See `sharesOf`.
     * @param _account address of the account to check the balance for
     */
    function balanceOf(address _account) external override view returns (uint256) {
        return sharesToTokens(_sharesOf(_account));
    }

    /**
     * @notice The amount of shares owned by an account
     * @param _account address of the account
     * @return the amount of shares owned by `_account`.
     */
    function sharesOf(address _account) public view returns (uint256) {
        return _sharesOf(_account);
    }

    /**
     * @notice The remaining number of tokens that `_spender` is allowed to spend
        behalf of `_owner` through `transferFrom`. This is zero by default.
     * @dev This value changes when `approve` or `transferFrom` is called.
     * @param _owner address that approved the allowance
     * @param _spender address that is allowed to spend the allowance
     * @return amount '_spender' is allowed to spend from '_owner'
     */
    function allowance(address _owner, address _spender) external override view returns (uint256) {
        return allowances[_owner][_spender];
    }

    /**
     * @notice The amount of shares that corresponds to `_tokens` protocol-controlled Tokens.
     * @param _tokens amount of tokens to calculate shares for
     * @return nominal amount of shares the tokens represent
     */
    function tokensToShares(uint256 _tokens) public view returns (uint256) {
        uint256 _totalPooledTokens = _getTotalPooledTokens();
        uint256 _totalShares = _getTotalShares();
        if (_totalPooledTokens == 0) {
            return 0;
        } else if (_totalShares == 0) {
            return _tokens;
        } else {
            return MathUtils.percOf(_tokens, _totalShares, _totalPooledTokens);
        }
    }

    /**
     * @notice The amount of tokens that corresponds to `_shares` token shares.
     * @param _shares the amount of shares to calculate the amount of tokens for
     * @return the amount of tokens represented by the shares
     */
    function sharesToTokens(uint256 _shares) public view returns (uint256) {
        uint256 currShares = _getTotalShares();
        if (currShares == 0) {
            return 0;
        } else {
            return MathUtils.percOf(_shares, _getTotalPooledTokens(), currShares);
        }
    }

    /**
     * @notice Transfers `_amount` tokens from the caller's account to the `_recipient` account.
     * @param _recipient address of the recipient
     * @param _amount amount of tokens to transfer
     * @return a boolean value indicating whether the operation succeeded.
     * @dev Emits a `Transfer` event.
     * @dev Requirements:
        - `_recipient` cannot be the zero address.
        - the caller must have a balance of at least `_amount`.
     * @dev The `_amount` argument is the amount of tokens, not shares.
     */
    function transfer(address _recipient, uint256 _amount) external override returns (bool) {
        _transfer(msg.sender, _recipient, _amount);
        return true;
    }

    /**
     * @notice Sets `_amount` as the allowance of `_spender` over the caller's tokens.
     * @param _spender address of the spender allowed to approve tokens from caller
     * @param _amount amount of tokens to allow '_spender' to spend
     * @return a boolean value indicating whether the operation succeeded.
     * @dev Emits an `Approval` event.
     * @dev Requirements:
        - `_spender` cannot be the zero address.
     * @dev The `_amount` argument is the amount of tokens, not shares.
     */
    function approve(address _spender, uint256 _amount) external override returns (bool) {
        _approve(msg.sender, _spender, _amount);
        return true;
    }

    /**
     * @notice Transfers `_amount` tokens from `_sender` to `_recipient` using the
        allowance mechanism. `_amount` is then deducted from the caller's allowance.
     * @param _sender address of the account to transfer tokens from
     * @param _recipient address of the recipient
     * @return a boolean value indicating whether the operation succeeded.
     * @dev Emits a `Transfer` event.
     * @dev Emits an `Approval` event indicating the updated allowance.
     * @dev Requirements:
        - `_sender` and `_recipient` cannot be the zero addresses.
        - `_sender` must have a balance of at least `_amount`.
        - the caller must have allowance for `_sender`'s tokens of at least `_amount`.
     * @dev The `_amount` argument is the amount of tokens, not shares.
     */
    function transferFrom(address _sender, address _recipient, uint256 _amount) external override returns (bool) {
        uint256 currentAllowance = allowances[_sender][msg.sender];
        require(currentAllowance >= _amount, "TRANSFER_AMOUNT_EXCEEDS_ALLOWANCE");

        _transfer(_sender, _recipient, _amount);
        _approve(_sender, msg.sender, currentAllowance - _amount);
        return true;
    }

    /**
     * @notice Atomically increases the allowance granted to `_spender` by the caller by `_addedValue`.
     * @param _spender address of the spender allowed to approve tokens from caller
     * @param _addedValue amount to add to allowance
     * @dev This is an alternative to `approve` that can be used as a mitigation for problems described in:
        https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/IERC20.sol#L42
     * @dev Emits an `Approval` event indicating the updated allowance.
     * @dev Requirements:
        - `_spender` cannot be the the zero address.
     */
    function increaseAllowance(address _spender, uint256 _addedValue) public returns (bool) {
        _approve(msg.sender, _spender, allowances[msg.sender][_spender] + _addedValue);
        return true;
    }

    /**
     * @notice Atomically decreases the allowance granted to `_spender` by the caller by `_subtractedValue`.
     * @param _spender address of the spender allowed to approve tokens from caller
     * @param _subtractedValue amount to subtract from current allowance
     * @dev This is an alternative to `approve` that can be used as a mitigation for problems described in:
        https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/IERC20.sol#L42
     * @dev Emits an `Approval` event indicating the updated allowance.
     * @dev Requirements:
        - `_spender` cannot be the zero address.
        - `_spender` must have allowance for the caller of at least `_subtractedValue`.
     */
    function decreaseAllowance(address _spender, uint256 _subtractedValue) public returns (bool) {
        uint256 currentAllowance = allowances[msg.sender][_spender];
        require(currentAllowance >= _subtractedValue, "DECREASED_ALLOWANCE_BELOW_ZERO");
        _approve(msg.sender, _spender, currentAllowance - _subtractedValue);
        return true;
    }

    /**
     * @notice Mints '_amount' of tokens for '_recipient'
     * @param _recipient address to mint tokens for
     * @param _amount amount to mint
     * @return a boolean value indicating whether the operation succeeded.
     * @dev Only callable by contract owner
     * @dev Calculates the amount of shares to create based on the specified '_amount' and creates new shares rather than minting actual tokens
     * @dev '_recipient' should also deposit into Tenderizer atomically to prevent diluation of existing particpants
     */
    function mint(address _recipient, uint256 _amount) public onlyOwner returns (bool) {
        uint256 _totalPooledTokens = _getTotalPooledTokens();
        if (_totalPooledTokens == 0) {
            _mintShares(_recipient, _amount);
        } else {
            uint256 _sharesToMint = sharesToTokens(_amount);
            _mintShares(_recipient, _sharesToMint);
        }
        _setTotalPooledTokens(totalPooledTokens + _amount);
        return true;
    }

    /**
     * @notice Burns '_amount' of tokens from '_recipient'
     * @param _account address to burn the tokens from
     * @param _amount amount to burn
     * @return a boolean value indicating whether the operation succeeded.
     * @dev Only callable by contract owner
     * @dev Calculates the amount of shares to destroy based on the specified '_amount' and destroy shares rather than burning tokens
     * @dev '_recipient' should also withdraw from Tenderizer atomically
     */
    function burn(address _account, uint256 _amount) public onlyOwner returns (bool) {
        uint256 _sharesToburn = sharesToTokens(_amount);
        _burnShares(_account, _sharesToburn);
        _setTotalPooledTokens(totalPooledTokens - _amount);
        return true;
    }

    /**
     * @notice Sets the total amount of pooled tokens controlled by the Tenderizer
     * @param _newTotalPooledTokens new amount of total tokens controlled by the Tenderizer
     * @dev Only callable by contract owner
     */
    function setTotalPooledTokens(uint256 _newTotalPooledTokens) public onlyOwner {
        _setTotalPooledTokens(_newTotalPooledTokens);
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
     * @dev Moves `_amount` tokens from `_sender` to `_recipient`.
     * @dev Emits a `Transfer` event.
     */
    function _transfer(address _sender, address _recipient, uint256 _amount) internal {
        uint256 _sharesToTransfer = tokensToShares(_amount);
        _transferShares(_sender, _recipient, _sharesToTransfer);
        emit Transfer(_sender, _recipient, _amount);
    }

    /**
     * @dev Sets `_amount` as the allowance of `_spender` over the `_owner` s tokens.
     * @dev Emits an `Approval` event.
     */
    function _approve(address _owner, address _spender, uint256 _amount) internal {
        require(_owner != address(0), "APPROVE_FROM_ZERO_ADDRESS");
        require(_spender != address(0), "APPROVE_TO_ZERO_ADDRESS");

        allowances[_owner][_spender] = _amount;
        emit Approval(_owner, _spender, _amount);
    }

    /**
     * @dev the total amount of shares in existence.
     */
    function _getTotalShares() internal view returns (uint256) {
        return totalShares;
    }

    /**
     * @dev the amount of shares owned by `_account`.
     */
    function _sharesOf(address _account) internal view returns (uint256) {
        return shares[_account];
    }

    /**
     * @dev Moves `_shares` shares from `_sender` to `_recipient`.
     * @dev Requirements:
        - `_sender` cannot be the zero address.
        - `_recipient` cannot be the zero address.
        - `_sender` must hold at least `_shares` shares.
     */
    function _transferShares(address _sender, address _recipient, uint256 _shares) internal {
        require(_sender != address(0), "TRANSFER_FROM_THE_ZERO_ADDRESS");
        require(_recipient != address(0), "TRANSFER_TO_THE_ZERO_ADDRESS");

        uint256 currentSenderShares = shares[_sender];
        require(_shares <= currentSenderShares, "TRANSFER_AMOUNT_EXCEEDS_BALANCE");

        shares[_sender] -= _shares;
        shares[_recipient] += _shares;
    }

    /**
     * @dev Creates `_shares` shares and assigns them to `_recipient`, increasing the total amount of shares.
     * @dev This doesn't increase the token total supply.
     * @dev Requirements:
        - `_recipient` cannot be the zero address.
     */
    function _mintShares(address _recipient, uint256 _shares) internal returns (uint256 newTotalShares) {
        require(_recipient != address(0), "MINT_TO_THE_ZERO_ADDRESS");

        newTotalShares = totalShares+ _shares;

        shares[_recipient] += _shares;

        // Notice: we're not emitting a Transfer event from the zero address here since shares mint
        // works by taking the amount of tokens corresponding to the minted shares from all other
        // token holders, proportionally to their share. The total supply of the token doesn't change
        // as the result. This is equivalent to performing a send from each other token holder's
        // address to `address`, but we cannot reflect this as it would require sending an unbounded
        // number of events.
        totalShares = newTotalShares;
    }

    /**
     * @dev Destroys `_shares` shares from `_account`'s holdings, decreasing the total amount of shares.
     * @dev This doesn't decrease the token total supply.
     * @dev Requirements:
        - `_account` cannot be the zero address.
        - `_account` must hold at least `_shares` shares.
     */
    function _burnShares(address _account, uint256 _shares) internal returns (uint256 newTotalShares) {
        require(_account != address(0), "BURN_FROM_THE_ZERO_ADDRESS");

        uint256 accountShares = shares[_account];
        require(_shares <= accountShares, "BURN_AMOUNT_EXCEEDS_BALANCE");

        newTotalShares = totalShares - _shares;

        shares[_account] -= _shares;

        // Notice: we're not emitting a Transfer event to the zero address here since shares burn
        // works by redistributing the amount of tokens corresponding to the burned shares between
        // all other token holders. The total supply of the token doesn't change as the result.
        // This is equivalent to performing a send from `address` to each other token holder address,
        // but we cannot reflect this as it would require sending an unbounded number of events.
        totalShares = newTotalShares;
    }
}
