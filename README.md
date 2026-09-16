# DAO Governance Treasury

A focused implementation of an on-chain DAO governance system using OpenZeppelin Governor, ERC20Votes, TimelockController, and a UUPS upgradeable ETH Treasury.

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
          |
          v
     Treasury V1
          |
   governance-approved
          v
     Treasury V2
```

OpenZeppelin's `GovernorTimelockControl` routes successful proposals through the `TimelockController`; the timelock therefore owns the Treasury and is the account allowed to execute Treasury operations. citehttps://docs.openzeppelin.com/contracts/5.x/api/governance

## Assignment requirements covered

- ERC20Votes governance token with delegation.
- OpenZeppelin Governor.
- GovernorCountingSimple for For / Against / Abstain votes.
- GovernorVotes and GovernorVotesQuorumFraction.
- OpenZeppelin TimelockController with a 1-hour minimum delay.
- Governor receives `PROPOSER_ROLE` and `CANCELLER_ROLE`.
- Executor role is open so any account can execute a ready proposal.
- Deployer renounces Timelock admin privileges after setup.
- UUPS upgradeable Treasury owned by the Timelock.
- Governance proposal can transfer ETH from the Treasury.
- Governance proposal can upgrade Treasury V1 to V2.
- Upgrade test verifies the proxy address, owner, and ETH balance are preserved and `version() == 2`.
- Direct EOA Treasury transfer and upgrade attempts are rejected.
- Docker and GitHub Actions CI included.

## Proposal lifecycle

```text
propose
   |
   v
Pending -> Active -> Succeeded
                      |
                      v
                    Queued
                      |
                 1 hour delay
                      |
                      v
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
test/
  governance.test.ts
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

The assignment-focused suite can be run directly with:

```bash
npm run test:assignment
```

## Local deployment

Start a local chain:

```bash
npm run node
```

In another terminal:

```bash
npm run deploy
```

The deployment script prints the GovernanceToken, Governor, TimelockController, Treasury proxy, owner, and Treasury balance.

## Docker

```bash
docker compose build
docker compose up
```

The container starts a local Hardhat JSON-RPC node on port `8545`.

## Important design decisions

### Governance token

The token uses OpenZeppelin `ERC20Votes`, so voting power is based on historical checkpoints. Holders must delegate their voting power before it can be used for governance votes. citehttps://docs.openzeppelin.com/contracts/5.x/governance

### Timelock

The TimelockController is the owner of the Treasury. Successful proposals are queued and can only execute after the minimum delay. This follows OpenZeppelin's Governor + TimelockController architecture. citehttps://docs.openzeppelin.com/contracts/5.x/api/governance

### Treasury upgrade

Treasury uses the UUPS pattern and restricts `_authorizeUpgrade` with `onlyOwner`. Since the Timelock owns the proxy, the upgrade must itself be approved by governance and executed through the timelock. OpenZeppelin documents `_authorizeUpgrade` as the required access-control hook for UUPS upgrades. citehttps://docs.openzeppelin.com/contracts/5.x/api/proxy

The OpenZeppelin Upgrades plugin is used for safe local proxy deployment. citehttps://docs.openzeppelin.com/contracts/5.x/upgradeable

## License

MIT
