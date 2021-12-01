// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ITenderizer {

    // Events
    event Deposit(address indexed from, uint256 amount);
    event Stake(address indexed node, uint256 amount);
    event Unstake(address indexed from, address indexed node, uint256 amount, uint256 unstakeLockID);
    event Withdraw(address indexed from, uint256 amount, uint256 unstakeLockID);
    event RewardsClaimed(uint256 rewards, uint256 currentPrincipal, uint256 oldPrincipal);
    event ProtocolFeeCollected(uint256 amount);
    event LiquidityFeeCollected(uint256 amount);
    event GovernanceUpdate(string _param);

    /**
     * @notice Deposit tokens in Tenderizer.
     * @param _from account that deposits
     * @param _amount amount deposited
     * @dev only callable by Controller.
     * @dev doesn't actually stakes the tokens but aggregates the balance in the tenderizer
     * awaiting to be staked.
     * @dev requires '_amount' to be approved by '_from'.
     */
    function deposit(address _from, uint256 _amount) external;

    /**
     * @notice Stake '_amount' of tokens to '_node'.
     * @param _node account to stake to in the underlying protocol
     * @param _amount amount to stake
     * @dev If '_node' is not specified, stake towards the default address.
     * @dev If '_amount' is 0, stake the entire current token balance of the Tenderizer.
     * @dev Only callable by controller.
     */
    function stake(address _node, uint256 _amount) external;

    /**
     * @notice Unstake '_amount' of tokens from '_account'.
     * @param _account account to unstake from in the underlying protocol
     * @param _amount amount to unstake
     * @dev If '_account' is not specified, stake towards the default address.
     * @dev If '_amount' is 0, unstake the entire amount staked towards _account.
     * @dev Only callable by controller.
     */
    function unstake(address _account, uint256 _amount) external returns (uint256 unstakeLockID);

    /**
     * @notice Withdraw '_amount' of tokens previously unstaked by '_account'.
     * @param _unstakeLockID ID for the lock to request the withdraw for
     * @param _account account requesting the withdrawam
     * @dev If '_amount' isn't specified all unstake tokens by '_account' will be withdrawn.
     * @dev Requires '_account' to have unstaked prior to calling withdraw.
     * @dev Only callable by controller.
     */
    function withdraw(address _account, uint256 _unstakeLockID) external;

    /**
     * @notice Claim staking rewards for the underlying protocol.
     * @dev Only callable by controller.
     */
    function claimRewards() external;

    /**
     * @notice Collect fees pulls any pending governance fees from the Tenderizer to the governance treasury.
     * @return Amount of protocol fees collected
     * @dev Resets pendingFees.
     * @dev Fees claimed are added to total staked.
     */
    function collectFees() external returns (uint256);

    /**
     * @notice Collect Liquidity fees pulls any pending LP fees from the Tenderizer to TenderFarm.
     * @return Amount of liquidity fees collected
     * @dev Resets pendingFees.
     * @dev Fees claimed are added to total staked.
     */
    function collectLiquidityFees() external returns (uint256);

    /**
     * @notice Total Staked Tokens returns the total amount of underlying tokens staked by this Tenderizer.
     * @return total amount staked by this Tenderizer
     */
    function totalStakedTokens() external view returns (uint256);

    /**
     * @notice Returns the number of tenderTokens to be minted for amountIn deposit.
     * @dev used by controller to calculate tokens to be minted before depositing.
     */
    function calcDepositOut(uint256 amountIn) external returns (uint256);

    function pendingFees() external view returns (uint256);

    function pendingLiquidityFees() external view returns (uint256);


    // Governance setter funtions

    function setController(address _controller) external;

    function setNode(address _node) external;

    function setSteak(IERC20 _steak) external;

    function setProtocolFee(uint256 _protocolFee) external;

    function setLiquidityFee(uint256 _liquidityFee) external;

    function setStakingContract(address _stakingContract) external;
}
