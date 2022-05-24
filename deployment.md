# Tenderizer Deployment

## Set Environment variables

Make sure the correct environment variables are set pre-deployment in the deploy/.env file

Also make sure to set the correct `PRIVATE_KEY` and `JSON_RPC` in the root .env file or from your terminal

## Set NAME in terminal

```bash
export NAME=...(e.g. Livepeer)
```

## Deploy Tenderizer

If dependencies are not deployed these will be deployed beforehand automatically

*It might be good to deploy them individually first*

```bash
yarn deploy:tenderizer --network $NETWORK
```

## Register Tenderizer

Registers the Tenderizer for indexing with the subgraph

```
 npx hardhat register --tenderizer $NAME --subgraphname $NAME --network $NETWORK
```

## Seed Liquidity and Farm

### Deposit into Tenderizer

Deposit collateral for tenderTokens, `--tokenamount` is in float format.

```bash  
npx hardhat deposit --tenderizer $NAME --tokenamount $AMOUNT --network $NETWORK
```

### Add liquidity

After depositing, add liquidity. It's best to do this 50/50 balanced 

*`$AMOUNT` might not necessarily be equal to the deposited amount if there's a tax charged when staking (e.g. The Graph)*

```bash
npx hardhat add-liquidity --tenderizer $NAME --tokenamount $AMOUNT --tenderamount $AMOUNT --network $NETWORK
```

### Farm SWAP tokens

Normally for a genesis pool for each token deposited you get 1 SWAP liquidity pool token from the previous step.

So if you deposit 10 LPT and 10tLPT you will get 20 tLPT-SWAP

But make sure to check your balance first and enter it as `$SWAP_AMOUNT`

`$RECEIVER` defaults to the transaction sender but can be optionally be provided to transfer ownership of farmed tokens to another account (e.g. multisig)

```bash
npx hardhat farm --tenderizer $NAME --tokenamount $SWAP_AMOUNT --receiver $RECEIVER --network $NETWORK
```


## Ensure Parameters are set correctly

Ensure parameters and fees are set correctly 

## Transfer ownership

If necessary transfer ownership to a multisig

Ownership needs to be transferred for

- Tenderizer_Proxy
- Set gov address to multisig
- TenderSwap for the Tenderizer

All three can be transferred simultaneously with the following hardhat task

```bash
npx hardhat tenderizer-ownership --tenderizer $NAME --owner $OWNER --network $NETWORK
```

## Set up a cronjob to rebase

Call the rebase task frequently using a cronjob on a VPS, can be called from any account.

```bash
npx hardhat rebase --tenderizer $NAME --network $NETWORK
```

## Dummy For Testing

You can set up a dummy staking contract (`DummyStaking.sol`) and dummy tenderizer (`DummyTenderizer.sol`) for testing purposes. 

You can control staking rewards and slashing with a simple script which will affect the tenderToken balances after rebasing. 

### Deploying DummyStaking

Deploys a dummy staking methods and ERC20 in a single contract. You should use the deployment address for both `TOKEN` and `CONTRACT` environment variables when deploying the `DummyTenderizer`

*`$SUPPLY` defaults to 1000000000000000000*

```bash
npx hardhat deploy-dummy --supply $SUPPLY --network $NETWORK
```

### Deploy DummyTenderizer

Set name to DummyTenderizer

```bash
export NAME=DummyTenderizer
```

Follow deployment steps above. You can also do this on a local network.

### Add rewards for DummyStaking

Increase the stake and tokens in the DummyStaking contract, specify an `$AMOUNT`, e.g. 10000

```bash
npx hardhat dummy-rewards --amount $AMOUNT --network $NETWORK
```

Rebase the DummyTenderizer

```bash
npx hardhat rebase --tenderizer $NAME --network $NETWORK
```

### Add to app

Provide the right addresses in `tender-app/packages/contracts/addresses.ts` 

Set the correct subgraphid in `tender-app/packages/shares/data/stakers.tsx`

