# Tenderizer

## Install

Make sure Node.js (>=v12.0) is installed.

```
git clone https://github.com/Tenderize/tender-core.git
cd tender-core
yarn
```

### Build

Compile the contracts and build artifacts used for testing and deployment.

```
yarn compile
```

### Clean

Remove existing build artifacts.

```
yarn clean
```

### Lint

The project uses [ESLint](https://github.com/eslint/eslint) for Typescript/Javascript linting and [Solhint](https://github.com/duaraghav8/Ethlint) and [Prettier](https://github.com/prettier-solidity/prettier-plugin-solidity) for Solidity linting.

```
yarn lint
```

### Run Tests

All tests will be executed via [hardhat](https://hardhat.org/guides/waffle-testing.html).

Make sure to add relevant API keys inside `.env` file.

To run all tests:

```
yarn test
```

To run unit tests only:

```
yarn test:unit
```

To run integration tests only:

```
yarn test:integration
```

To run gas reporting tests (via [hardhat-gas-reporter](https://hardhat.org/plugins/hardhat-gas-reporter.html)) only:

```
yarn test:gas
```

To run tests with coverage (via [solidity-coverage](https://github.com/sc-forks/solidity-coverage)) reporting:

```
yarn test:coverage
```

## Deployment

Make sure that an ETH node is accessible and that the network being deployed to is supported by the `hardhat.config.ts` configuration.

Make sure that you enter a `PRIVATE_KEY` and `INFURA_KEY` in the root's `.env` file when using a live network.

By default an in-memory Hardhat VM will be used, to specify another network use the `--network` flag.

### Deploying dependencies

To be able to deploy Tenderizers, first the dependencies need to be deployed.

```bash
yarn deploy:libraries
```

```bash
yarn deploy:registry
```

These commands will export the contract artifacts to `deployments/{networkName}/{ContractName}.json`

### Deploying tenderizers

A Tenderizer is a combination of contracts, some general dependencies will be re-used. After deployment the new tenderizer will be registered with the `Registry`.

To deploy a Tenderizer provide its name and then execute the deployment. E.g. `export NAME=Livepeer` will ensure that the Livepeer Tenderizer is deployed and saved to `deployments/{networkName}/Livepeer.json` with all its dependencies and contracts in a single file.

```bash
export NAME=
yarn deploy:tenderizer
```
