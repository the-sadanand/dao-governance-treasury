# DAO with On-Chain Governance and Treasury Management

A fully functional Decentralized Autonomous Organization (DAO) with on-chain governance built using Solidity, Hardhat, and OpenZeppelin contracts.

## Architecture

The DAO consists of four main smart contracts:

```
┌─────────────────────┐     ┌──────────────────────┐
│  GovernanceToken    │     │     MyGovernor        │
│  (ERC20Votes)       │◄────│  (Governor + Settings │
│  - Voting power     │     │   + Counting + Votes  │
│  - Delegation       │     │   + Quorum + Timelock)│
└─────────────────────┘     └──────────┬───────────┘
                                       │ proposes to
                            ┌──────────▼───────────┐
                            │ TimelockController    │
                            │ - Enforces delay      │
                            │ - Executes proposals  │
                            │ - Owns Treasury       │
                            └──────────┬───────────┘
                                       │ controls
                            ┌──────────▼───────────┐
                            │     Treasury          │
                            │  - Holds DAO funds    │
                            │  - Upgradeable (UUPS) │
                            │  - onlyOwner access   │
                            └──────────────────────┘
```

### Components

1. **GovernanceToken (ERC20Votes)**: An ERC-20 token with voting capabilities. Token holders can delegate their voting power to themselves or others.

2. **MyGovernor**: The core governance contract built on OpenZeppelin's Governor framework. Handles proposal creation, voting, and execution through the timelock.
   - Voting Delay: 1 block
   - Voting Period: 10 blocks
   - Proposal Threshold: 0 tokens
   - Quorum: 4% of total supply

3. **TimelockController**: A security layer that enforces a mandatory delay (1 hour) between when a proposal passes and when it can be executed.

4. **Treasury**: An upgradeable contract (UUPS proxy pattern) that holds and manages the DAO's ETH funds. Only the Timelock can authorize fund transfers.

## Prerequisites

- Node.js >= 18
- npm >= 9
- Docker & Docker Compose (for containerized development)

## Setup

### Local Development

```bash
# Clone the repository
git clone <repository-url>
cd dao-governance

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Compile contracts
npm run compile

# Run tests
npm test

# Start local Hardhat node
npm run node

# In a new terminal, deploy contracts
npm run deploy
```

### Docker

```bash
# Start the Hardhat node in a container
docker-compose up -d

# Wait for the node to be healthy
docker-compose ps

# Deploy contracts to the containerized node
npm run deploy
```

## Testing

The test suite covers the entire governance lifecycle:

```bash
npm test
```

### Test Coverage

- **Contract Deployment**: Verifies all contracts are deployed with correct parameters
- **Token Operations**: Minting, delegation, and voting power
- **Proposal Creation**: Creating proposals with proper encoding
- **Voting**: Casting votes (For, Against, Abstain) and vote tallying
- **Proposal Lifecycle**: Full flow from Pending → Active → Succeeded → Queued → Executed
- **Proposal Defeat**: Proposals that don't meet quorum or have more Against votes
- **Treasury Operations**: Fund transfers through governance
- **Upgradeability**: Upgrading the Treasury contract to V2 while preserving state
- **Access Control**: Timelock roles and Treasury ownership

## Proposal Lifecycle

1. **Create Proposal**: A token holder calls `propose()` on the Governor
2. **Voting Delay**: Wait for the voting delay period (1 block)
3. **Voting Period**: Token holders cast votes (For/Against/Abstain) for 10 blocks
4. **Succeeded/Defeated**: Proposal passes if quorum is met and For > Against
5. **Queue**: Passed proposal is queued in the Timelock
6. **Timelock Delay**: Mandatory 1-hour delay for community review
7. **Execute**: Anyone can execute the proposal after the delay

## Project Structure

```
dao-governance/
├── contracts/
│   ├── GovernanceToken.sol    # ERC20 voting token (upgradeable)
│   ├── Treasury.sol           # DAO treasury (upgradeable, UUPS)
│   ├── TreasuryV2.sol         # Treasury upgrade with version()
│   └── MyGovernor.sol         # Governor contract
├── scripts/
│   ├── deploy.ts              # Full deployment script
│   └── upgrade-treasury.ts    # Treasury upgrade script
├── test/
│   └── governance.test.ts     # Comprehensive test suite
├── hardhat.config.ts          # Hardhat configuration
├── docker-compose.yml         # Docker Compose configuration
├── Dockerfile                 # Docker build file
├── .env.example               # Environment variables template
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript configuration
└── README.md                  # This file
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|--------|
| `PRIVATE_KEY` | Deployer account private key | Hardhat default account |
| `RPC_URL` | Ethereum node RPC URL | `http://localhost:8545` |
| `TREASURY_PROXY_ADDRESS` | Treasury proxy address (for upgrades) | - |

## Security Considerations

- The Timelock is the sole owner of the Treasury, ensuring all fund transfers go through governance
- The deployer renounces all admin roles after setup for full decentralization
- The Timelock enforces a 1-hour delay on all executed proposals
- UUPS proxy pattern allows contract upgrades through governance votes
- ERC20Votes ensures snapshot-based voting to prevent flash loan attacks

## License

MIT
