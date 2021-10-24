// SPDX-License-Identifier: GNUV3

pragma solidity 0.6.12;

// Needed to handle structures externally
pragma experimental ABIEncoderV2;

// Imports
import "configurable-rights-pool/contracts/ConfigurableRightsPool.sol";

/**
 * @author Ampleforth engineering team & Balancer Labs
 *
 * Reference:
 * https://github.com/balancer-labs/configurable-rights-pool/blob/master/contracts/templates/ElasticSupplyPool.sol
 *
 * @title Ampl Elastic Configurable Rights Pool.
 *
 * @dev   Extension of Balancer labs' configurable rights pool (smart-pool).
 *        Amples are a dynamic supply tokens, supply and individual balances change daily by a Rebase operation.
 *        In constant-function markets, Ampleforth's supply adjustments result in Impermanent Loss (IL)
 *        to liquidity providers. The AmplElasticCRP is an extension of Balancer Lab's
 *        ConfigurableRightsPool which mitigates IL induced by supply adjustments.
 *
 *        It accomplishes this by doing the following mechanism:
 *        The `resyncWeight` method will be invoked atomically after rebase through Ampleforth's orchestrator.
 *
 *        When rebase changes supply, ampl weight is updated to the geometric mean of
 *        the current ampl weight and the target. Every other token's weight is updated
 *        proportionally such that relative ratios are same.
 *
 *        Weights: {w_ampl, w_t1 ... w_tn}
 *
 *        Rebase_change: x% (Ample's supply changes by x%, can be positive or negative)
 *
 *        Ample target weight: w_ampl_target = (100+x)/100 * w_ampl
 *
 *        w_ampl_new = sqrt(w_ampl * w_ampl_target)  // geometric mean
 *        for i in tn:
 *           w_ti_new = (w_ampl_new * w_ti) / w_ampl_target
 *
 */
contract ElasticSupplyPool is ConfigurableRightsPool {
    constructor(
        address factoryAddress,
        PoolParams memory poolParams,
        RightsManager.Rights memory rightsStruct
    ) public ConfigurableRightsPool(factoryAddress, poolParams, rightsStruct) {
        require(rights.canChangeWeights, "ERR_NOT_CONFIGURABLE_WEIGHTS");
    }

    /**
     * @notice Create a new Smart Pool - and set the block period time parameters
     * @dev Initialize the swap fee to the value provided in the CRP constructor
     *      Can be changed if the canChangeSwapFee permission is enabled
     *      Time parameters will be fixed at these values
     *
     *      If this contract doesn't have canChangeWeights permission - or you want to use the default
     *      values, the block time arguments are not needed, and you can just call the single-argument
     *      createPool()
     * @param initialSupply - Starting token balance
     * @param minimumWeightChangeBlockPeriodParam - Enforce a minimum time between the start and end blocks
     * @param addTokenTimeLockInBlocksParam - Enforce a mandatory wait time between updates
     *                                   This is also the wait time between committing and applying a new token
     */
    function createPool(
        uint256 initialSupply,
        uint256 minimumWeightChangeBlockPeriodParam,
        uint256 addTokenTimeLockInBlocksParam
    ) external override onlyOwner logs lock {
        require(
            minimumWeightChangeBlockPeriodParam >= addTokenTimeLockInBlocksParam,
            "ERR_INCONSISTENT_TOKEN_TIME_LOCK"
        );

        minimumWeightChangeBlockPeriod = minimumWeightChangeBlockPeriodParam;
        addTokenTimeLockInBlocks = addTokenTimeLockInBlocksParam;

        createPoolInternal(initialSupply);
    }

    function updateWeight(address token, uint256 newWeight) external override logs onlyOwner needsBPool {
        revert("ERR_UNSUPPORTED_OPERATION");
    }

    function updateWeightsGradually(
        uint256[] calldata newWeights,
        uint256 startBlock,
        uint256 endBlock
    ) external override logs onlyOwner needsBPool {
        revert("ERR_UNSUPPORTED_OPERATION");
    }

    function pokeWeights() external override logs needsBPool {
        revert("ERR_UNSUPPORTED_OPERATION");
    }

    /*
     * @param token The address of the token in the underlying BPool to be resynced
     */
    function resyncWeight(address token) external logs lock needsBPool {
        require(IBPool(address(bPool)).isBound(token), "ERR_NOT_BOUND");

        // sync balance
        IBPool(address(bPool)).gulp(token);
    }
}
