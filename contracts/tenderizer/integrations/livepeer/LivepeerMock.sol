pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract LivepeerMock {
    constructor(IERC20 _lpt) {
        lpt = _lpt;
    }

    IERC20 lpt;

    function bond(uint256 _amount, address _to) external {
        require(lpt.transferFrom(msg.sender, address(this), _amount));
    }

    function unbond(uint256 _amount) external {}

    function rebond(uint256 _unbondingLockId) external {}

    function rebondFromUnbonded(address _to, uint256 _unbondingLockId) external {}

    function withdrawStake(uint256 _unbondingLockId) external {}

    function withdrawFees() external {}

    function claimEarnings(uint256 _endRound) external {}

    function pendingFees(address _delegator, uint256 _endRound) external view returns (uint256) {}

    function pendingStake(address _delegator, uint256 _endRound) external view returns (uint256) {}

    function getDelegator(address _delegator)
        external
        view
        returns (
            uint256 bondedAmount,
            uint256 fees,
            address delegateAddress,
            uint256 delegatedAmount,
            uint256 startRound,
            uint256 lastClaimRound,
            uint256 nextUnbondingLockId
        )
    {}
}
