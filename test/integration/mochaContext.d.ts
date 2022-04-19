
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { BigNumber, Contract } from 'ethers'
import { LiquidityPoolToken, SimpleToken, Tenderizer, TenderSwap, TenderToken } from '../../typechain'

declare module 'mocha' {
    export interface Context{
        signers: SignerWithAddress[]
        deployer: string
        Steak: SimpleToken
        StakingContract: Contract
        methods: {
            stake: string,
            unstake: string,
            withdrawStake: string
          }
        NAME: string
        SYMBOL: string
        NODE: string
        initialStake: BigNumber
        deposit: BigNumber
        DELEGATION_TAX: BigNumber
        MAX_PPM: BigNumber
        unbondLockID: number
        govUnboundLockID: number
        Tenderizer: Tenderizer
        TenderizerImpl: Tenderizer
        TenderToken: TenderToken
        TenderSwap: TenderSwap
        LpToken: LiquidityPoolToken
        increase: BigNumber
        liquidityFees: BigNumber
        protocolFees: BigNumber
        decrease: BigNumber
        newStake: BigNumber
        expectedCP: BigNumber
        withdrawAmount: BigNumber
    }
}
