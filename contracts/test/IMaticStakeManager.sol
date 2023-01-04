// SPDX-FileCopyrightText: 2021 Tenderize <info@tenderize.me>

// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

enum Status {
    Inactive,
    Active,
    Locked,
    Unstaked
}

struct Validator {
    uint256 amount;
    uint256 reward;
    uint256 activationEpoch;
    uint256 deactivationEpoch;
    uint256 jailTime;
    address signer;
    address contractAddress;
    Status status;
    uint256 commissionRate;
    uint256 lastCommissionUpdate;
    uint256 delegatorsReward;
    uint256 delegatedAmount;
    uint256 initialRewardPerStake;
}

interface IMaticStakeManager {
    // validator replacement
    function startAuction(
        uint256 validatorId,
        uint256 amount,
        bool acceptDelegation,
        bytes calldata signerPubkey
    ) external;

    function confirmAuctionBid(uint256 validatorId, uint256 heimdallFee) external;

    function transferFunds(
        uint256 validatorId,
        uint256 amount,
        address delegator
    ) external returns (bool);

    function delegationDeposit(
        uint256 validatorId,
        uint256 amount,
        address delegator
    ) external returns (bool);

    function unstake(uint256 validatorId) external;

    function totalStakedFor(address addr) external view returns (uint256);

    function stakeFor(
        address user,
        uint256 amount,
        uint256 heimdallFee,
        bool acceptDelegation,
        bytes memory signerPubkey
    ) external;

    function checkSignatures(
        uint256 blockInterval,
        bytes32 voteHash,
        bytes32 stateRoot,
        address proposer,
        uint256[3][] calldata sigs
    ) external returns (uint256);

    function updateValidatorState(uint256 validatorId, int256 amount) external;

    function ownerOf(uint256 tokenId) external view returns (address);

    function slash(bytes calldata slashingInfoList) external returns (uint256);

    function validatorStake(uint256 validatorId) external view returns (uint256);

    function currentValidatorSetSize() external view returns (uint256);

    function epoch() external view returns (uint256);

    function getRegistry() external view returns (address);

    function withdrawalDelay() external view returns (uint256);

    function delegatedAmount(uint256 validatorId) external view returns (uint256);

    function decreaseValidatorDelegatedAmount(uint256 validatorId, uint256 amount) external;

    function withdrawDelegatorsReward(uint256 validatorId) external returns (uint256);

    function delegatorsReward(uint256 validatorId) external view returns (uint256);

    function dethroneAndStake(
        address auctionUser,
        uint256 heimdallFee,
        uint256 validatorId,
        uint256 auctionAmount,
        bool acceptDelegation,
        bytes calldata signerPubkey
    ) external;

    function updateSigner(uint256 validatorId, bytes memory signerPubkey) external;

    function validators(uint256 validatorId) external view returns (Validator memory);
}
