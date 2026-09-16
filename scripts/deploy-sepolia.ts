import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer, voter] = await ethers.getSigners();
  if (!deployer || !voter) throw new Error("No deployer account configured");

  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const VOTER_ALLOCATION = ethers.parseEther("100000");
  const TREASURY_FUNDING = ethers.parseEther(process.env.TREASURY_FUNDING_ETH || "0");
  const VOTING_DELAY = 1;
  const VOTING_PERIOD = 10;
  const PROPOSAL_THRESHOLD = 0;
  const QUORUM_PERCENTAGE = 4;
  const MIN_DELAY = 3600;

  console.log(`Network: Sepolia`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Voter:    ${voter.address}`);

  const Token = await ethers.getContractFactory("GovernanceToken");
  const token = await Token.deploy(INITIAL_SUPPLY);
  await token.waitForDeployment();
  await (await token.transfer(voter.address, VOTER_ALLOCATION)).wait();
  await (await token.delegate(deployer.address)).wait();
  await (await token.connect(voter).delegate(voter.address)).wait();

  const Timelock = await ethers.getContractFactory("TimelockController");
  const timelock = await Timelock.deploy(MIN_DELAY, [], [ethers.ZeroAddress], deployer.address);
  await timelock.waitForDeployment();

  const Governor = await ethers.getContractFactory("MyGovernor");
  const governor = await Governor.deploy(
    await token.getAddress(),
    await timelock.getAddress(),
    VOTING_DELAY,
    VOTING_PERIOD,
    PROPOSAL_THRESHOLD,
    QUORUM_PERCENTAGE
  );
  await governor.waitForDeployment();

  await (await timelock.grantRole(await timelock.PROPOSER_ROLE(), await governor.getAddress())).wait();
  await (await timelock.grantRole(await timelock.CANCELLER_ROLE(), await governor.getAddress())).wait();
  await (await timelock.renounceRole(await timelock.DEFAULT_ADMIN_ROLE(), deployer.address)).wait();

  const Treasury = await ethers.getContractFactory("Treasury");
  const treasury = await upgrades.deployProxy(Treasury, [await timelock.getAddress()], { kind: "uups" });
  await treasury.waitForDeployment();

  if (TREASURY_FUNDING > 0n) {
    await (await deployer.sendTransaction({ to: await treasury.getAddress(), value: TREASURY_FUNDING })).wait();
  }

  console.log("\nSepolia deployment complete:");
  console.log(`GovernanceToken:     ${await token.getAddress()}`);
  console.log(`MyGovernor:         ${await governor.getAddress()}`);
  console.log(`TimelockController: ${await timelock.getAddress()}`);
  console.log(`Treasury proxy:     ${await treasury.getAddress()}`);
  console.log(`Treasury owner:     ${await treasury.owner()}`);
  console.log(`Treasury balance:   ${ethers.formatEther(await treasury.balance())} ETH`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
