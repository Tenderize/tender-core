// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

import "./token/ITenderToken.sol";
import "./tenderizer/ITenderizer.sol";
import "./liquidity/ITenderFarm.sol";
import "./liquidity/ITenderSwap.sol";

/**
 * @title Controller contract for a Tenderizer.
 * @notice Entry point for all contract interactions and dependency manager; making required internal transactions
 * to underlying contracts like the Tenderizer operations (user deposits, staking, unstaking etc),
 * minting/burning TenderTokens etc.
 * @dev Set as owner of TenderFarm, TenderToken, Tenderizer.
 */

contract Controller is Initializable, ReentrancyGuardUpgradeable {
    IERC20 public steak;
    ITenderizer public tenderizer;
    ITenderToken public tenderToken;
    ITenderSwap public tenderSwap;
    ITenderFarm public tenderFarm;

    address public gov;

    struct TenderSwapConfig {
        address tenderSwapTarget;
        address lpTokenTarget;
        string lpTokenName;
        string lpTokenSymbol; // e.g. tLPT-LPT-SWAP
        uint256 amplifier;
        uint256 fee;
        uint256 adminFee;
    }

    struct TenderTokenConfig {
        address tenderTokenTarget;
        string name;
        string symbol; 
    }

    function initialize(
        IERC20 _steak,
        ITenderizer _tenderizer,
        TenderSwapConfig calldata _tenderSwapConfig,
        TenderTokenConfig calldata _tenderTokenConfig
    ) public initializer {
        __ReentrancyGuard_init_unchained();
        steak = _steak;
        tenderizer = _tenderizer;

        // Clone TenderToken
        ITenderToken tenderToken_ = ITenderToken(Clones.clone(_tenderTokenConfig.tenderTokenTarget));
        require(
            tenderToken_.initialize(
                _tenderTokenConfig.name,
                _tenderTokenConfig.symbol,
                ITotalStakedReader(address(_tenderizer))
            ),
            "FAIL_INIT_TENDERTOKEN"
        );
        tenderToken = tenderToken_;
        gov = msg.sender;

        // Clone an existing LP token deployment in an immutable way
        // see https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.2.0/contracts/proxy/Clones.sol
        tenderSwap = ITenderSwap(Clones.clone(_tenderSwapConfig.tenderSwapTarget));
        require(
            tenderSwap.initialize(
                IERC20(address(tenderToken_)),
                _steak,
                _tenderSwapConfig.lpTokenName,
                _tenderSwapConfig.lpTokenSymbol,
                _tenderSwapConfig.amplifier,
                _tenderSwapConfig.fee,
                _tenderSwapConfig.adminFee,
                _tenderSwapConfig.lpTokenTarget
            ),
            "FAIL_INIT_TENDERSWAP"
        );
    }

    modifier onlyGov() {
        require(msg.sender == gov);
        _;
    }

    /**
     * @notice Deposit tokens in Tenderizer to earn staking rewards.
     * @param _amount amount deposited
     * @dev calls Tenderizer to deposit tokens and updates total pooled tokens.
     * @dev equal amount of tenderTokens are minted for the caller.
     * @dev requires '_amount' to be approved by '_from'.
     */
    function deposit(uint256 _amount) public {
        require(_amount > 0, "ZERO_AMOUNT");

        // Calculate tenderTokens to be minted
        uint256 amountOut = tenderizer.calcDepositOut(_amount);
        
        // mint tenderTokens
        require(tenderToken.mint(msg.sender, amountOut), "TENDER_MINT_FAILED");

        // deposit tokens
        tenderizer.deposit(msg.sender, _amount);

        // Transfer tokens to tenderizer
        require(steak.transferFrom(msg.sender, address(tenderizer), _amount), "STEAK_TRANSFERFROM_FAILED");
    }

    /**
     * @notice Unlock staked tokens.
     * @param _amount amount deposited
     * @return unstakeLockID
     * @dev calls Tenderizer to unstake tokens and updates total pooled tokens.
     * @dev equal amount of tenderTokens are burned from the user.
     * @dev unstaking functionality varies by the protocol, check tenderizer.unstake().
     */
    function unlock(uint256 _amount) public nonReentrant returns (uint256 unstakeLockID) {
        require(_amount > 0, "ZERO_AMOUNT");

        // Burn tenderTokens
        require(tenderToken.burn(msg.sender, _amount), "TENDER_BURN_FAILED");

        // Unstake tokens for pending withdrawal
        unstakeLockID = tenderizer.unstake(msg.sender, _amount);
    }

    /**
     * @notice Withdraws unstaked tokens.
     * @param _unstakeLockID lockID of the unstake
     * @dev tokens need to be unstaked before they can be withdrawn.
     * @dev caller address should match the user address in lock.
     */
    function withdraw(uint256 _unstakeLockID) public nonReentrant {
        // Execute pending withdrawal
        // Reverts if unthawing period hasn't ended
        tenderizer.withdraw(msg.sender, _unstakeLockID);
    }

    /**
     * @notice Rebase will stake pending deposits, claim rewards, 
     * resync the liquidity pool and collect fees.
     * @dev only callable by owner(gov).
     */
    function rebase() public nonReentrant {
        // claim rewards
        tenderizer.claimRewards();

        // stake tokens
        gulp();
    }

    /**
     * @notice Gulp stakes any unstaked token balance held by the Tenderizer.
     * @dev deposit() only aggregates stake in the tenderizer, while gulp
     * will perform the actual stake call.
     * @dev only callable by owner(gov).
     */
    function gulp() public {
        // gulp steak balance of Tenderizer and stake it
        try tenderizer.stake(address(0), 0) {} catch {}
    }

    /**
     * @notice Collect pending protocol fees from Tenderizer.
     * @dev mints equal number of tender tokens to the owner.
     * @dev only callable by owner(gov).
     */
    function collectFees() public onlyGov {
        _collectFees();
    }

    /**
     * @notice Collect pending liquidity provider fees from Tenderizer.
     * @dev mints equal number of tender tokens to the tenderFarm.
     * @dev only callable by owner(gov).
     */
    function collectLiquidityFees() public onlyGov {
        _collectLiquidityFees();
    }

    function migrateToNewTenderizer(ITenderizer _tenderizer) public onlyGov {}

    /**
     * @notice Set TenderFarm contract.
     * @param _tenderFarm TenderFarm contract address
     * @dev only callable by owner(gov).
     */
    function setTenderFarm(ITenderFarm _tenderFarm) public onlyGov {
        tenderFarm = _tenderFarm;
    }

    /**
     * @notice Set new Governance address.
     * @param _gov Governance address
     * @dev only callable by owner(gov).
     */
    function setGov(address _gov) public onlyGov {
        require(_gov != address(0), "ZERO_ADDRESS");
        gov = _gov;
    }

    /**
     * @notice Exectutes a transaction on behalf of the controller.
     * @param _target target address for the contract call
     * @param _value ether value to be transeffered with the transaction
     * @param _data call data - check ethers.interface.encodeFunctionData()
     * @dev only callable by owner(gov).
     */
    function execute(
        address _target,
        uint256 _value,
        bytes calldata _data
    ) public onlyGov {
        _execute(_target, _value, _data);
    }

    /**
     * @notice Exectutes a batch of transaction on behalf of the controller.
     * @param _targets array of target addresses for the contract call
     * @param _values array of ether values to be transeffered with the transactions
     * @param _datas array of call datas - check ethers.interface.encodeFunctionData()
     * @dev Every target to its value, data via it's corresponding index.
     * @dev only callable by owner(gov).
     */
    function batchExecute(
        address[] calldata _targets,
        uint256[] calldata _values,
        bytes[] calldata _datas
    ) public onlyGov {
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

    function _collectFees() internal {
        // mint tenderToken to fee distributor (governance)
        tenderToken.mint(gov, tenderizer.pendingFees());
        tenderizer.collectFees();
    }

    function _collectLiquidityFees() internal {
        if (tenderFarm.nextTotalStake() == 0) return;

        // mint tenderToken and transfer to tenderFarm
        uint256 amount = tenderizer.pendingLiquidityFees();
        tenderToken.mint(address(this), amount);
        tenderizer.collectLiquidityFees();

        tenderToken.approve(address(tenderFarm), amount);
        tenderFarm.addRewards(amount);
    }
}
