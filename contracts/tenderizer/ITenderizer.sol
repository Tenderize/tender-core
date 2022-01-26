// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../tenderfarm/ITenderFarm.sol";

/**
 * @title Tenderizer is the base contract to be implemented.
 * @notice Tenderizer is responsible for all Protocol interactions (staking, unstaking, claiming rewards)
 * while also keeping track of user depsotis/withdrawals and protocol fees.
 * @dev New implementations are required to inherit this contract and override any required internal functions.
 */
interface ITenderizer {
    // Events
    event Deposit(address indexed from, uint256 amount);
    event Stake(address indexed node, uint256 amount);
    event Unstake(address indexed from, address indexed node, uint256 amount, uint256 unstakeLockID);
    event Withdraw(address indexed from, uint256 amount, uint256 unstakeLockID);
    event RewardsClaimed(int256 stakeDiff, uint256 currentPrincipal, uint256 oldPrincipal);
    event ProtocolFeeCollected(uint256 amount);
    event LiquidityFeeCollected(uint256 amount);
    event GovernanceUpdate(string _param);

    /**
     * @notice Deposit tokens in Tenderizer.
     * @param _amount amount deposited
     * @dev doesn't actually stakes the tokens but aggregates the balance in the tenderizer
     * awaiting to be staked.
     * @dev requires '_amount' to be approved by '_from'.
     */
    function deposit(uint256 _amount) external;

    /**
     * @notice Deposit tokens in Tenderizer with permit.
     * @param _amount amount deposited
     * @param _deadline deadline for the permit
     * @param _v from ECDSA signature
     * @param _r from ECDSA signature
     * @param _s from ECDSA signature
     * @dev doesn't actually stakes the tokens but aggregates the balance in the tenderizer
     * awaiting to be staked.
     * @dev requires '_amount' to be approved by '_from'.
     */
    function depositWithPermit(
        uint256 _amount,
        uint256 _deadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external;

    /**
     * @notice Stake '_amount' of tokens to '_node'.
     * @param _node account to stake to in the underlying protocol
     * @param _amount amount to stake
     * @dev If '_node' is not specified, stake towards the default address.
     * @dev If '_amount' is 0, stake the entire current token balance of the Tenderizer.
     * @dev Only callable by Gov.
     */
    function stake(address _node, uint256 _amount) external;

    /**
     * @notice Unstake '_amount' of tokens from '_account'.
     * @param _amount amount to unstake
     * @return unstakeLockID unstake lockID generated for unstake
     * @dev unstake from the default address.
     * @dev If '_amount' is 0, unstake the entire amount staked towards _account.
     */
    function unstake(uint256 _amount) external returns (uint256 unstakeLockID);

    /**
     * @notice Withdraw '_amount' of tokens previously unstaked by '_account'.
     * @param _unstakeLockID ID for the lock to request the withdraw for
     * @dev If '_amount' isn't specified all unstake tokens by '_account' will be withdrawn.
     * @dev Requires '_account' to have unstaked prior to calling withdraw.
     */
    function withdraw(uint256 _unstakeLockID) external;

    /**
     * @notice Compound all the rewards and new deposits.
     * Claim staking rewards and earned fees for the underlying protocol and stake
     * any leftover token balance. Process Tender protocol fees if revenue is positive.
     */
    function claimRewards() external;

    /**
     * @notice Collect fees pulls any pending governance fees from the Tenderizer to the governance treasury.
     * @return amount Amount of protocol fees collected
     * @dev Resets pendingFees.
     * @dev Fees claimed are added to total staked.
     */
    function collectFees() external returns (uint256 amount);

    /**
     * @notice Collect Liquidity fees pulls any pending LP fees from the Tenderizer to TenderFarm.
     * @return amount Amount of liquidity fees collected
     * @dev Resets pendingFees.
     * @dev Fees claimed are added to total staked.
     */
    function collectLiquidityFees() external returns (uint256 amount);

    /**
     * @notice Total Staked Tokens returns the total amount of underlying tokens staked by this Tenderizer.
     * @return totalStaked total amount staked by this Tenderizer
     */
    function totalStakedTokens() external view returns (uint256 totalStaked);

    /**
     * @notice Returns the number of tenderTokens to be minted for amountIn deposit.
     * @return depositOut number of tokens staked for `amountIn`.
     * @dev used by controller to calculate tokens to be minted before depositing.
     * @dev to be used when there a delegation tax is deducted, for eg. in Graph.
     */
    function calcDepositOut(uint256 _amountIn) external returns (uint256 depositOut);

    /**
     * @notice Returns the amount of pending protocool fees since last claiming..
     * @return amount the amount of fees pending since last claim
     */
    function pendingFees() external view returns (uint256 amount);

    /**
     * @notice Returns the amount of pending liquidity provider fees since last claiming.
     * @return amount the amount of liqudity fees pending since last claim
     */
    function pendingLiquidityFees() external view returns (uint256 amount);

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
    ) external;

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
    ) external;

    // Governance setter funtions

    function setGov(address _gov) external;

    function setNode(address _node) external;

    function setSteak(IERC20 _steak) external;

    function setProtocolFee(uint256 _protocolFee) external;

    function setLiquidityFee(uint256 _liquidityFee) external;

    function setStakingContract(address _stakingContract) external;

    function setTenderFarm(ITenderFarm _tenderFarm) external;
}
