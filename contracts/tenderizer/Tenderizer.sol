// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/proxy/Clones.sol";

import "./ITenderizer.sol";
import "../token/ITenderToken.sol";
import "../liquidity/ITenderSwap.sol";
import "../liquidity/ITenderSwapFactory.sol";

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
    ITenderToken public tenderToken;
    ITenderSwap public tenderSwap;
    ITenderFarm public tenderFarm;

    address public node;

    uint256 public protocolFee;
    uint256 public liquidityFee;
    uint256 public override pendingFees; // pending protocol fees since last distribution
    uint256 public override pendingLiquidityFees;
    uint256 public currentPrincipal; // Principal since last claiming earnings

    mapping(uint256 => UnstakeLock) public unstakeLocks;
    uint256 nextUnstakeLockID;

    address public gov;

    modifier onlyGov() {
        require(msg.sender == gov);
        _;
    }

    function _initialize(
        IERC20 _steak,
        address _node,
        ITenderSwapFactory tenderSwapfactory,
        ITenderToken.Config calldata _tenderTokenConfig,
        ITenderSwap.Config calldata _tenderSwapConfig
    ) internal initializer {
        steak = _steak;
        node = _node;
        protocolFee = 25 * 1e15; // 2.5%

        // Clone TenderToken
        ITenderToken tenderToken_ = ITenderToken(Clones.clone(_tenderTokenConfig.tenderTokenTarget));
        require(
            tenderToken_.initialize(
                _tenderTokenConfig.name,
                _tenderTokenConfig.symbol,
                ITotalStakedReader(address(this))
            ),
            "FAIL_INIT_TENDERTOKEN"
        );
        tenderToken = tenderToken_;
        gov = msg.sender;

        tenderSwap = tenderSwapfactory.deploy(
            address(tenderToken_),
            address(_steak),
            _tenderSwapConfig
        );
    }

    /// @inheritdoc ITenderizer
    function deposit(uint256 _amount) external override {
         require(_amount > 0, "ZERO_AMOUNT");

        // Calculate tenderTokens to be minted
        uint256 amountOut = calcDepositOut(_amount);
        
        // mint tenderTokens
        require(tenderToken.mint(msg.sender, amountOut), "TENDER_MINT_FAILED");

        // Transfer tokens to tenderizer
        require(steak.transferFrom(msg.sender, address(this), _amount), "STEAK_TRANSFERFROM_FAILED");

        _deposit(msg.sender, _amount);
    }

    /// @inheritdoc ITenderizer
    function gulp() public override {
        // Execute state updates
        // approve pendingTokens for staking
        // Stake tokens
        _stake(node, steak.balanceOf(address(this)));
    }

    /// @inheritdoc ITenderizer
    function stake(address _account, uint256 _amount) external override onlyGov {
        // Execute state updates
        // approve pendingTokens for staking
        // Stake tokens
        _stake(_account, _amount);
    }

    /// @inheritdoc ITenderizer
    function unstake(uint256 _amount)
        external
        override
        returns (uint256 unstakeLockID)
    {
        // Burn tenderTokens if not gov
        // TODO: CHECK THIS!
        if(msg.sender != gov) {
            require(tenderToken.burn(msg.sender, _amount), "TENDER_BURN_FAILED");
        }

        // Execute state updates to pending withdrawals
        // Unstake tokens
        return _unstake(msg.sender, address(0), _amount);
    }

    /// @inheritdoc ITenderizer
    function withdraw(uint256 _unstakeLockID) external override {
        // Execute state updates to pending withdrawals
        // Transfer tokens to _account
        _withdraw(msg.sender, _unstakeLockID);
    }

    /// @inheritdoc ITenderizer
    function rebase() public override {
        // claim rewards
        claimRewards();

        // stake tokens
        gulp();
    }

    /// @inheritdoc ITenderizer
    function claimRewards() public override {
        // Claim rewards
        // If received staking rewards in steak don't automatically compound, add to pendingTokens
        // Swap tokens with address != steak to steak
        // Add steak from swap to pendingTokens
        _claimRewards();
    }

    /// @inheritdoc ITenderizer
    function totalStakedTokens() external view override returns (uint256) {
        return _totalStakedTokens();
    }

    function setNode(address _node) external virtual override onlyGov {
        require(_node != address(0), "ZERO_ADDRESS");
        node = _node;
        emit GovernanceUpdate("NODE");
    }

    function setSteak(IERC20 _steak) external virtual override onlyGov {
        require(address(_steak) != address(0), "ZERO_ADDRESS");
        steak = _steak;
        emit GovernanceUpdate("STEAK");
    }

    function setProtocolFee(uint256 _protocolFee) external virtual override onlyGov {
        protocolFee = _protocolFee;
        emit GovernanceUpdate("PROTOCOL_FEE");
    }

    function setLiquidityFee(uint256 _liquidityFee) external virtual override onlyGov {
        liquidityFee = _liquidityFee;
        emit GovernanceUpdate("LIQUIDITY_FEE");
    }

    function setStakingContract(address _stakingContract) external override onlyGov {
        _setStakingContract(_stakingContract);
    }

    function setTenderFarm(ITenderFarm _tenderFarm) external override onlyGov {
        require(address(_tenderFarm) != address(0), "ZERO_ADDRESS");
        tenderFarm = _tenderFarm;
        emit GovernanceUpdate("TENDERFARM");
    }

    // Fee collection
    /// @inheritdoc ITenderizer
    function collectFees() external override onlyGov returns (uint256) {
        // mint tenderToken to fee distributor (governance)
        tenderToken.mint(gov, pendingFees);

        return _collectFees();
    }

    /// @inheritdoc ITenderizer
    function collectLiquidityFees() external override onlyGov returns (uint256 amount) {
        if (tenderFarm.nextTotalStake() == 0) return 0;

        // mint tenderToken and transfer to tenderFarm
        amount = pendingLiquidityFees;
        tenderToken.mint(address(this), amount);
        _collectLiquidityFees();

        // TODO: Move this approval to infinite approval in initialize()?
        tenderToken.approve(address(tenderFarm), amount);
        tenderFarm.addRewards(amount);
    }

    /// @inheritdoc ITenderizer
    function calcDepositOut(uint256 _amountIn) override public view virtual returns (uint256 amountOut) {
        return _calcDepositOut(_amountIn);
    }

    /// @inheritdoc ITenderizer
    function execute (
        address _target,
        uint256 _value,
        bytes calldata _data
    ) external override onlyGov {
        _execute(_target, _value, _data);
    }

    /// @inheritdoc ITenderizer
    function batchExecute(
        address[] calldata _targets,
        uint256[] calldata _values,
        bytes[] calldata _datas
    ) external override onlyGov {
        require(_targets.length == _values.length && _targets.length == _datas.length, "INVALID_ARGUMENTS");
        for (uint256 i = 0; i < _targets.length; i++) {
            _execute(_targets[i], _values[i], _datas[i]);
        }
    }

    // Internal functions

    function _calcDepositOut(uint256 _amountIn) internal view virtual returns (uint256 amountOut) {
        return _amountIn;
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

    function _execute(
        address _target,
        uint256 _value,
        bytes calldata _data
    ) internal {
        (bool success, bytes memory returnData) = _target.call{ value: _value }(_data);
        require(success, string(returnData));
    }
}
