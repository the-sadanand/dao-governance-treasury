import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer, voter] = await ethers.getSigners();
  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const VOTING_DELAY = 1;
  const VOTING_PERIOD = 10;
  const PROPOSAL_THRESHOLD = 0;
  const QUORUM_PERCENTAGE = 4;
  const MIN_DELAY = 3600;

  console.log(`Deployer: ${deployer.address}`);
  console.log(`Voter:    ${voter.address}`);

  const Token = await ethers.getContractFactory("GovernanceToken");
  const token = await Token.deploy(INITIAL_SUPPLY);
  await token.waitForDeployment();
  await (await token.transfer(voter.address, ethers.parseEther("100000"))).wait();
  await (await token.delegate(deployer.address)).wait();
  await (await token.connect(voter).delegate(voter.address)).wait();

  const Timelock = await ethers.getContractFactory("TimelockController");
  const timelock = await Timelock.deploy(
    MIN_DELAY,
    [],
    [ethers.ZeroAddress],
    deployer.address
  );
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

  const proposerRole = await timelock.PROPOSER_ROLE();
  const cancellerRole = await timelock.CANCELLER_ROLE();
  const adminRole = await timelock.DEFAULT_ADMIN_ROLE();
  await (await timelock.grantRole(proposerRole, await governor.getAddress())).wait();
  await (await timelock.grantRole(cancellerRole, await governor.getAddress())).wait();
  await (await timelock.renounceRole(adminRole, deployer.address)).wait();

  const Treasury = await ethers.getContractFactory("Treasury");
  const treasury = await upgrades.deployProxy(
    Treasury,
    [await timelock.getAddress()],
    { kind: "uups" }
  );
  await treasury.waitForDeployment();

  await (await deployer.sendTransaction({
    to: await treasury.getAddress(),
    value: ethers.parseEther("10")
  })).wait();

  console.log("\nDeployment complete:");
  console.log(`GovernanceToken:    ${await token.getAddress()}`);
  console.log(`MyGovernor:        ${await governor.getAddress()}`);
  console.log(`TimelockController:${await timelock.getAddress()}`);
  console.log(`Treasury proxy:    ${await treasury.getAddress()}`);
  console.log(`Treasury owner:    ${await treasury.owner()}`);
  console.log(`Treasury balance:  ${ethers.formatEther(await treasury.balance())} ETH`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
