import { ethers, upgrades } from "hardhat";
import { TimelockController } from "../typechain-types";

async function main() {
  const [deployer, addr1, addr2, addr3] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // ========== 1. Deploy Governance Token (Upgradeable - UUPS) ==========
  console.log("\n--- Deploying GovernanceToken ---");
  const GovernanceToken = await ethers.getContractFactory("GovernanceToken");
  const governanceToken = await upgrades.deployProxy(
    GovernanceToken,
    [deployer.address],
    { kind: "uups" }
  );
  await governanceToken.waitForDeployment();
  const govTokenAddress = await governanceToken.getAddress();
  console.log("GovernanceToken deployed to:", govTokenAddress);

  // ========== 2. Mint tokens and delegate ==========
  console.log("\n--- Minting tokens and delegating ---");
  const mintAmount = ethers.parseEther("1000");

  // Mint to deployer and test accounts
  await governanceToken.mint(deployer.address, mintAmount);
  await governanceToken.mint(addr1.address, mintAmount);
  await governanceToken.mint(addr2.address, mintAmount);
  await governanceToken.mint(addr3.address, ethers.parseEther("500"));

  // Delegate voting power to self for each account
  await governanceToken.connect(deployer).delegate(deployer.address);
  await governanceToken.connect(addr1).delegate(addr1.address);
  await governanceToken.connect(addr2).delegate(addr2.address);
  await governanceToken.connect(addr3).delegate(addr3.address);

  console.log("Tokens minted and delegated.");

  // ========== 3. Deploy TimelockController ==========
  console.log("\n--- Deploying TimelockController ---");
  const MIN_DELAY = 3600; // 1 hour in seconds

  // Initially set deployer as proposer/executor, will update roles after Governor deployment
  const TimelockFactory = await ethers.getContractFactory("TimelockController", {
    libraries: {},
  });

  // Deploy with: minDelay, proposers (empty initially), executors (zero address = anyone), admin (deployer)
  const timelock = await TimelockFactory.deploy(
    MIN_DELAY,
    [], // proposers - will add governor later
    [ethers.ZeroAddress], // executors - anyone can execute
    deployer.address // admin - will renounce later
  ) as unknown as TimelockController;
  await timelock.waitForDeployment();
  const timelockAddress = await timelock.getAddress();
  console.log("TimelockController deployed to:", timelockAddress);

  // ========== 4. Deploy Governor ==========
  console.log("\n--- Deploying MyGovernor ---");
  const MyGovernor = await ethers.getContractFactory("MyGovernor");
  const VOTING_DELAY = 1; // 1 block
  const VOTING_PERIOD = 10; // 10 blocks
  const PROPOSAL_THRESHOLD = 0; // 0 tokens needed to propose
  const QUORUM_PERCENTAGE = 4; // 4% quorum

  const governor = await MyGovernor.deploy(
    govTokenAddress,
    timelockAddress,
    VOTING_DELAY,
    VOTING_PERIOD,
    PROPOSAL_THRESHOLD,
    QUORUM_PERCENTAGE
  );
  await governor.waitForDeployment();
  const governorAddress = await governor.getAddress();
  console.log("MyGovernor deployed to:", governorAddress);

  // ========== 5. Deploy Treasury (Upgradeable - UUPS) ==========
  console.log("\n--- Deploying Treasury ---");
  const Treasury = await ethers.getContractFactory("Treasury");
  const treasury = await upgrades.deployProxy(
    Treasury,
    [timelockAddress], // Owner is the Timelock
    { kind: "uups" }
  );
  await treasury.waitForDeployment();
  const treasuryAddress = await treasury.getAddress();
  console.log("Treasury deployed to:", treasuryAddress);

  // ========== 6. Configure Timelock Roles ==========
  console.log("\n--- Configuring Timelock Roles ---");

  // Grant PROPOSER_ROLE to the Governor
  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  await timelock.grantRole(PROPOSER_ROLE, governorAddress);
  console.log("Granted PROPOSER_ROLE to Governor");

  // Grant CANCELLER_ROLE to the Governor
  const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
  await timelock.grantRole(CANCELLER_ROLE, governorAddress);
  console.log("Granted CANCELLER_ROLE to Governor");

  // Renounce TIMELOCK_ADMIN_ROLE from deployer
  const TIMELOCK_ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();
  await timelock.renounceRole(TIMELOCK_ADMIN_ROLE, deployer.address);
  console.log("Deployer renounced TIMELOCK_ADMIN_ROLE");

  // ========== 7. Summary ==========
  console.log("\n========== Deployment Summary ==========");
  console.log("GovernanceToken:", govTokenAddress);
  console.log("TimelockController:", timelockAddress);
  console.log("MyGovernor:", governorAddress);
  console.log("Treasury:", treasuryAddress);
  console.log("Voting Delay:", VOTING_DELAY, "block(s)");
  console.log("Voting Period:", VOTING_PERIOD, "block(s)");
  console.log("Proposal Threshold:", PROPOSAL_THRESHOLD);
  console.log("Quorum Percentage:", QUORUM_PERCENTAGE, "%");
  console.log("Timelock Min Delay:", MIN_DELAY, "seconds");
  console.log("========================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
