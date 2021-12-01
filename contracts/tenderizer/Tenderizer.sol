// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import "./ITenderizer.sol";

/**
 * @title Tenderizer is the base contract to be implemented.
 * @notice Tenderizer is responsible for all Protocol interactions (staking, unstaking, claiming rewards)
 * while also keeping track of user depsotis/withdrawals and protocol fees.
 * @dev New implementations are required to inherit this contract and override any required internal functions.
 */
abstract contract Tenderizer is Initializable, ITenderizer {
    struct UnstakeLock {
        uint256 amount;
        address account;
    }

    address constant ZERO_ADDRESS = address(0);

    IERC20 public steak;
    address public node;

    address public controller;

    uint256 public protocolFee;
    uint256 public liquidityFee;
    uint256 public override pendingFees; // pending protocol fees since last distribution
    uint256 public override pendingLiquidityFees;
    uint256 public currentPrincipal; // Principal since last claiming earnings

    mapping(uint256 => UnstakeLock) public unstakeLocks;
    uint256 nextUnstakeLockID;

    modifier onlyController() {
        require(msg.sender == controller);
        _;
    }

    function _initialize(
        IERC20 _steak,
        address _node,
        address _controller
    ) internal initializer {
        steak = _steak;
        node = _node;
        protocolFee = 25 * 1e15; // 2.5%
        controller = _controller;
    }

    /**
     * @notice Deposit tokens in Tenderizer
     * @param _from account that deposits
     * @param _amount amount deposited
     * @dev only callable by Controller.
     * @dev doesn't actually stakes the tokens but aggregates the balance in the tenderizer
     * awaiting to be staked.
     * @dev requires '_amount' to be approved by '_from'.
     */
    function deposit(address _from, uint256 _amount) external override onlyController {
        _deposit(_from, _amount);
    }

    /**
     * @notice Stake '_amount' of tokens to '_account'
     * @param _account account to stake to in the underlying protocol
     * @param _amount amount to stake
     * @dev If '_account' is not specified, stake towards the default address.
     * @dev If '_amount' is 0, stake the entire current token balance of the Tenderizer.
     * @dev Only callable by controller.
     */
    function stake(address _account, uint256 _amount) external override onlyController {
        // Execute state updates
        // approve pendingTokens for staking
        // Stake tokens
        _stake(_account, _amount);
    }

    /**
     * @notice Unstake '_amount' of tokens from '_account'
     * @param _account account to unstake from in the underlying protocol
     * @param _amount amount to unstake
     * @dev If '_account' is not specified, stake towards the default address.
     * @dev If '_amount' is 0, unstake the entire amount staked towards _account.
     * @dev Only callable by controller.
     */
    function unstake(address _account, uint256 _amount)
        external
        override
        onlyController
        returns (uint256 unstakeLockID)
    {
        // Execute state updates to pending withdrawals
        // Unstake tokens
        return _unstake(_account, address(0), _amount);
    }

    /**
     * @notice Withdraw '_amount' of tokens previously unstaked by '_account'
     * @param _unstakeLockID ID for the lock to request the withdraw for
     * @param _account account requesting the withdrawam
     * @dev If '_amount' isn't specified all unstake tokens by '_account' will be withdrawn.
     * @dev Requires '_account' to have unstaked prior to calling withdraw.
     * @dev Only callable by controller.
     */
    function withdraw(address _account, uint256 _unstakeLockID) external override onlyController {
        // Execute state updates to pending withdrawals
        // Transfer tokens to _account
        _withdraw(_account, _unstakeLockID);
    }

    /**
     * @notice Claim staking rewards for the underlying protocol.
     * @dev Only callable by controller.
     */
    function claimRewards() external override onlyController {
        // Claim rewards
        // If received staking rewards in steak don't automatically compound, add to pendingTokens
        // Swap tokens with address != steak to steak
        // Add steak from swap to pendingTokens
        _claimRewards();
    }

    /**
     * @notice Total Staked Tokens returns the total amount of underlying tokens staked by this Tenderizer.
     * @return total amount staked by this Tenderizer
     */
    function totalStakedTokens() external view override returns (uint256) {
        return _totalStakedTokens();
    }

    // Setter functions
    function setController(address _controller) external override onlyController {
        require(_controller != address(0), "ZERO_ADDRESS");
        controller = _controller;
        emit GovernanceUpdate("CONTROLLER");
    }

    function setNode(address _node) external virtual override onlyController {
        require(_node != address(0), "ZERO_ADDRESS");
        node = _node;
        emit GovernanceUpdate("NODE");
    }

    function setSteak(IERC20 _steak) external virtual override onlyController {
        require(address(_steak) != address(0), "ZERO_ADDRESS");
        steak = _steak;
        emit GovernanceUpdate("STEAK");
    }

    function setProtocolFee(uint256 _protocolFee) external virtual override onlyController {
        protocolFee = _protocolFee;
        emit GovernanceUpdate("PROTOCOL_FEE");
    }

    function setLiquidityFee(uint256 _liquidityFee) external virtual override onlyController {
        liquidityFee = _liquidityFee;
        emit GovernanceUpdate("LIQUIDITY_FEE");
    }

    function setStakingContract(address _stakingContract) external override onlyController {
        _setStakingContract(_stakingContract);
    }

    // Fee collection
    /**
     * @notice Collect fees pulls any pending governance fees from the Tenderizer to the governance treasury.
     * @return Amount of protocol fees collected
     * @dev Resets pendingFees.
     * @dev Fees claimed are added to total staked.
     */
    function collectFees() external override onlyController returns (uint256) {
        return _collectFees();
    }

    /**
     * @notice Collect Liquidity fees pulls any pending LP fees from the Tenderizer to TenderFarm.
     * @return Amount of liquidity fees collected
     * @dev Resets pendingFees.
     * @dev Fees claimed are added to total staked.
     */
    function collectLiquidityFees() external override onlyController returns (uint256) {
        return _collectLiquidityFees();
    }

    /**
     * @notice Returns the number of tenderTokens to be minted for amountIn deposit.
     * @dev used by controller to calculate tokens to be minted before depositing.
     */
    function calcDepositOut(uint256 amountIn) override public virtual returns (uint256);

    function _deposit(address _account, uint256 _amount) internal virtual;

    function _stake(address _account, uint256 _amount) internal virtual;

    function _unstake(
        address _account,
        address _node,
        uint256 _amount
    ) internal virtual returns (uint256 unstakeLockID);

    function _withdraw(address _account, uint256 _unstakeLockID) internal virtual;

    function _claimRewards() internal virtual;

    function _collectFees() internal virtual returns (uint256) {
        // set pendingFees to 0
        // Controller will mint tenderToken and distribute it
        uint256 before = pendingFees;
        pendingFees = 0;
        currentPrincipal += before;
        emit ProtocolFeeCollected(before);
        return before;
    }

    function _collectLiquidityFees() internal virtual returns (uint256) {
        // set pendingFees to 0
        // Controller will mint tenderToken and distribute it
        uint256 before = pendingLiquidityFees;
        pendingLiquidityFees = 0;
        currentPrincipal += before;
        emit LiquidityFeeCollected(before);
        return before;
    }

    function _totalStakedTokens() internal view virtual returns (uint256);

    function _setStakingContract(address _stakingContract) internal virtual;
}
