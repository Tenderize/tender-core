// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import "./ITenderizer.sol";

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
    uint256 public pendingFees; // pending protocol fees since last distribution
    uint256 public pendingLiquidityFees;
    uint256 public currentPrincipal; // Principal since last claiming earnings

    mapping(uint256 => UnstakeLock) public unstakeLocks;
    uint256 lastUnstakeLockID;

    // Events
    event Deposit(address indexed from, uint256 amount);
    event Stake(address indexed node, uint256 amount);
    event Unstake(address indexed from, address indexed node, uint256 amount, uint256 unstakeLockID);
    event Withdraw(address indexed from, uint256 amount, uint256 unstakeLockID);
    event RewardsClaimed(uint256 rewards, uint256 currentPrincipal, uint256 oldPrincipal);
    event ProtocolFeeCollected(uint256 amount);
    event LiquidityFeeCollected(uint256 amount);
    event GovernanceUpdate(string _param);

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
     * @dev only callable by Controller
     * @dev doesn't actually stakes the tokens but aggregates the balance in the tenderizer
        awaiting to be staked
     * @dev requires '_amount' to be approved by '_from'
     */
    function deposit(address _from, uint256 _amount) external override onlyController {
        _deposit(_from, _amount);
    }

    /**
     * @notice Stake '_amount' of tokens to '_account'
     * @param _account account to stake to in the underlying protocol
     * @param _amount amount to stake
     * @dev If '_account' is not specified, stake towards the default address
     * @dev If '_amount' is 0, stake the entire current token balance of the Tenderizer
     * @dev Only callable by controller
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
     * @dev If '_account' is not specified, stake towards the default address
     * @dev If '_amount' is 0, unstake the entire amount staked towards _account
     * @dev Only callable by controller
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
     * @dev If '_amount' isn't specified all unstake tokens by '_account' will be withdrawn
     * @dev Requires '_account' to have unstaked prior to calling withdraw
     * @dev Only callable by controller
     */
    function withdraw(address _account, uint256 _unstakeLockID) external override onlyController {
        // Execute state updates to pending withdrawals
        // Transfer tokens to _account
        _withdraw(_account, _unstakeLockID);
    }

    /**
     * @notice Claim staking rewards for the underlying protocol
     * @dev Only callable by controller
     */
    function claimRewards() external override onlyController {
        // Claim rewards
        // If received staking rewards in steak don't automatically compound, add to pendingTokens
        // Swap tokens with address != steak to steak
        // Add steak from swap to pendingTokens
        _claimRewards();
    }

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

    function collectFees() external override onlyController returns (uint256) {
        return _collectFees();
    }

    function collectLiquidityFees() external override onlyController returns (uint256) {
        return _collectLiquidityFees();
    }

    function totalStakedTokens() external view override returns (uint256) {
        return _totalStakedTokens();
    }

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
        emit ProtocolFeeCollected(before);
        return before;
    }

    function _collectLiquidityFees() internal virtual returns (uint256) {
        // set pendingFees to 0
        // Controller will mint tenderToken and distribute it
        uint256 before = pendingLiquidityFees;
        pendingLiquidityFees = 0;
        emit LiquidityFeeCollected(before);
        return before;
    }

    function _totalStakedTokens() internal view virtual returns (uint256);

    // Internal governance functions
    function _setStakingContract(address _stakingContract) internal virtual;
}
