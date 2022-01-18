# Hacken audit - Jan 2022
## Contracts

All natspec comments for functions can be found in their respective Interfaces. Do not hesitate to contact us for any clarifications/explainations.

### Tenderizer
The Tenderizer is the main contract that is responsible for accepting user deposits, issueing derivative TenderTokens, and making the actual deposits to the staking contracts of the underlying protcols (Livepeer, Graph, Matic, Audius).
Each implementation for integrating implements the abstract `Tenderizer` contract and overrides the functions with protocol specific calls/requirements;

Regarding deployment, an instance of the Tenderswap, Tenderfarm and TenderToken are first deployed. When a Tenderizer for a certain protocol is deployed, it clones each of the contracts mentioned before for each protocol.

When it comes to ACL, the owner of each of the contracts below is the Tenderizer. And Tenderizer owner(gov) would be a multi-sig and later a gov contract when that is complete.

Users can also unstake their positions via the Tenderizer. Based on the protocol there are two methods of unstaking, one in which the unstake/withdraw calls are simply proxied via the tenderizer to the underlying contracts. And the second is where user unstakes are batched together, and then the contract owner (gov) makes a call to process the batched unstakes. After the usntaking period is over gov performs the withdrawal, and then users can individually make their withdrawals. TenderTokens are burnt while unstaking and a unstakeLock is created. Withdrawals are checekd against the unstakeLock and the assets are disperesed to the user. 

A portion of the rewards earned are set aside as protocol fees and liquidity fees. Liquidity fees are transfered to the Tenderfarm. Protocol fees can be claimed by the owner (gov).

### TenderToken
A rebasing ERC-20 token with shares, where total supply is read directly from the Tenderizer (total staked amount). So for every token staked the supply is "rebased" to meet that amount.

TenderTokens work on the mechanism of shares ie. when new tokens are minted, the equivalent number of shares are minted for the address such that `tenderTokenBalance = shares * totalTokens / totalShares`, where totalTokens is Tenderizer.currentPrinciple ie. the amount of tokens that are staked.

### TenderSwap
A stableswap AMM for tenderTokens and the underlying assets eg. tLPT-LPT (mostly forked from Saddle Finanace). This is what makes staking liquid ie. using can isntantly swap their tenderTokens for their underlying assets without any unstaking period. LPs are awarded with LP tokens that can be farmed for rewards in the TenderFarm contract.

### TenderFarm
The Tenderfarm accepts LP tokens and awards tenderTokens over time based on the amounts farmed, which can be claimed at any time.

## Scope of the audit

Scope of the Audit includes and is not exchaustive unless specified otherwise, with an emphasised focus on the loss of user funds:
- Tenderizer base implementation and it's extenstions (contracts/tenderizer)
    - The Tenderizer contracts, and how they interact with other contracts and the staking contracts from underlying protocols. ONLY Livepeer, Graph, Matic, we shall have Audius audited in the coming weeks, but the main focus would be the other three, it the order they are listed in.
    - Attacks whereby users might be able to dodge slashes
    - Attacks related to rebasing, eg. user stakes, then rebases, and immediately swaps
- TenderToken implementation (contracts/token/TenderToken.sol)
    - Implications of rebasing supply, which is directly read from the Tenderizer
- TenderFarm implementation (contracts/tenderfarm)
- TenderSwap implementation can be EXCLUDED from the audit as it is mostly a fork from Saddle.Finance