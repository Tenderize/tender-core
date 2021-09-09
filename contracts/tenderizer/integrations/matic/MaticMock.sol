pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MaticMock {
    constructor(IERC20 _matic) {
        matic = _matic;
    }

    IERC20 matic;
    function owner() external view returns (address) {}

    function restake() public {}

    function buyVoucher(uint256 _amount, uint256 _minSharesToMint) external {}

    function sellVoucher_new(uint256 _claimAmount, uint256 _maximumSharesToBurn) external {}

    function unstakeClaimTokens_new(uint256 _unbondNonce) external {}

    function exchangeRate() external view returns (uint256) {}

    function validatorId() external view returns (uint256) {}

    function balanceOf(address _from) external view returns (uint256) {}
}
