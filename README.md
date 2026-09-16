# DAO Governance Treasury

A complete on-chain DAO governance system using OpenZeppelin Governor, ERC20Votes, TimelockController, and a UUPS upgradeable ETH Treasury.

## Architecture

```text
GovernanceToken (ERC20Votes)
          |
          v
     MyGovernor
          |
          v
 TimelockController
          |
          v
 Treasury Proxy (UUPS)
      |         |
      v         v
 Treasury V1  Treasury V2
```

The Timelock owns the Treasury. Successful governance proposals are queued and cannot execute until the one-hour minimum delay has elapsed.

## Assignment requirements covered

- ERC20Votes governance token with delegation.
- OpenZeppelin Governor with simple For / Against / Abstain counting.
- GovernorVotes and GovernorVotesQuorumFraction.
- TimelockController with a 1-hour minimum delay.
- Governor receives PROPOSER_ROLE and CANCELLER_ROLE.
- Executor role is open so any account can execute a ready proposal.
- Deployer renounces Timelock admin privileges after setup.
- UUPS upgradeable Treasury owned by the Timelock.
- Governance-controlled ETH transfer.
- Governance-controlled Treasury V1 to V2 upgrade.
- Upgrade test verifies proxy address, owner, ETH balance, and version 2.
- Direct EOA Treasury transfer and upgrade attempts are rejected.
- Edge-case tests for early execution, insufficient funds, no votes, Against/Abstain votes, and unauthorized Timelock scheduling.
- Sepolia deployment configuration and deployment script.
- Browser frontend with wallet connection and Treasury proposal creation.
- Docker and GitHub Actions CI.

## Proposal lifecycle

```text
propose -> Pending -> Active -> Succeeded -> Queued
                                              |
                                         1 hour delay
                                              |
                                           Executed
```

## Project structure

```text
contracts/
  GovernanceToken.sol
  MyGovernor.sol
  Treasury.sol
  TreasuryV2.sol
scripts/
  deploy.ts
  deploy-sepolia.ts
test/
  governance.test.ts
frontend/
  index.html
  app.js
  styles.css
hardhat.config.ts
Dockerfile
docker-compose.yml
.env.example
```

## Local setup

Requirements: Node.js 18+ and npm.

```bash
npm install
npm run compile
npm test
```

Assignment suite:

```bash
npm run test:assignment
```

The current suite covers both the required happy paths and important failure cases.

## Local deployment

Terminal 1:

```bash
npm run node
```

Terminal 2:

```bash
npm run deploy
```

The deployment script prints all contract addresses and the Treasury owner/balance.

## Sepolia testnet deployment

Create `.env` from `.env.example` and set a Sepolia RPC URL plus a dedicated testnet deployer private key. Never commit a real private key.

Optional Treasury funding amount:

```text
TREASURY_FUNDING_ETH=0.1
```

Deploy:

```bash
npx hardhat run scripts/deploy-sepolia.ts --network sepolia
```

The script is deliberately configured so Treasury funding defaults to zero. This avoids unexpectedly spending testnet ETH during deployment.

## Frontend

The `frontend/` directory is a lightweight browser UI using ethers.js from a CDN. It can connect to MetaMask, show TGT balance, voting power and Treasury balance, and create an ETH transfer proposal.

After deploying to Sepolia, copy the printed addresses into the `CONFIG` object in `frontend/app.js`. Serve the folder with any static web server.

The frontend never contains a private key; wallet transactions are signed by the user's wallet.

## Security and production-oriented design

- Treasury uses UUPS with an initializer and implementation locking.
- `_authorizeUpgrade` is restricted to the Treasury owner, which is the Timelock rather than an EOA.
- Timelock admin privileges are renounced after role setup.
- Successful Treasury actions must pass governance and the timelock delay.
- Open executor allows permissionless execution after a proposal becomes ready.
- Solidity optimizer is enabled for deployed bytecode.
- OpenZeppelin Upgrades validation is used for the UUPS proxy deployment.
- Tests cover unauthorized direct access and important execution failure paths.
- Secrets are supplied through environment variables rather than committed files.

## CI

GitHub Actions runs:

```bash
npm install
npm run compile
npm run test:assignment
```

The latest completed CI run before the latest enhancement commit passed compilation and all assignment tests.

## License

MIT
