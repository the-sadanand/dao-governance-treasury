import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { mine, time } from "@nomicfoundation/hardhat-network-helpers";

const VOTING_DELAY = 1;
const VOTING_PERIOD = 10;
const QUORUM_PERCENTAGE = 4;
const MIN_DELAY = 3600;

async function deploySystem() {
  const [deployer, voter, recipient, outsider] = await ethers.getSigners();
  const Token = await ethers.getContractFactory("GovernanceToken");
  const token = await Token.deploy(ethers.parseEther("1000000"));
  await token.waitForDeployment();
  await (await token.transfer(voter.address, ethers.parseEther("100000"))).wait();
  await (await token.delegate(deployer.address)).wait();
  await (await token.connect(voter).delegate(voter.address)).wait();

  const Timelock = await ethers.getContractFactory("TimelockController");
  const timelock = await Timelock.deploy(MIN_DELAY, [], [ethers.ZeroAddress], deployer.address);
  await timelock.waitForDeployment();

  const Governor = await ethers.getContractFactory("MyGovernor");
  const governor = await Governor.deploy(await token.getAddress(), await timelock.getAddress(), VOTING_DELAY, VOTING_PERIOD, 0, QUORUM_PERCENTAGE);
  await governor.waitForDeployment();

  await (await timelock.grantRole(await timelock.PROPOSER_ROLE(), await governor.getAddress())).wait();
  await (await timelock.grantRole(await timelock.CANCELLER_ROLE(), await governor.getAddress())).wait();
  await (await timelock.renounceRole(await timelock.DEFAULT_ADMIN_ROLE(), deployer.address)).wait();

  const Treasury = await ethers.getContractFactory("Treasury");
  const treasury = await upgrades.deployProxy(Treasury, [await timelock.getAddress()], { kind: "uups" });
  await treasury.waitForDeployment();
  await (await deployer.sendTransaction({ to: await treasury.getAddress(), value: ethers.parseEther("10") })).wait();
  return { deployer, voter, recipient, outsider, token, timelock, governor, treasury };
}

async function proposal(governor: any, voter: any, targets: string[], values: bigint[], calldatas: string[], description: string) {
  await (await governor.connect(voter).propose(targets, values, calldatas, description)).wait();
  const descriptionHash = ethers.id(description);
  const proposalId = await governor.hashProposal(targets, values, calldatas, descriptionHash);
  return { proposalId, descriptionHash };
}

async function passAndQueue(governor: any, voter: any, targets: string[], values: bigint[], calldatas: string[], description: string) {
  const result = await proposal(governor, voter, targets, values, calldatas, description);
  await mine(VOTING_DELAY + 1);
  await (await governor.connect(voter).castVote(result.proposalId, 1)).wait();
  await mine(VOTING_PERIOD + 1);
  expect(await governor.state(result.proposalId)).to.equal(4n);
  await (await governor.queue(targets, values, calldatas, result.descriptionHash)).wait();
  expect(await governor.state(result.proposalId)).to.equal(5n);
  return result;
}

describe("DAO assignment: Governor + Timelock + upgradeable Treasury", function () {
  it("deploys the required governance architecture", async function () {
    const { deployer, token, timelock, governor, treasury } = await deploySystem();
    expect(await token.name()).to.equal("Task Governance Token");
    expect(await token.symbol()).to.equal("TGT");
    expect(await token.getVotes(deployer.address)).to.equal(ethers.parseEther("900000"));
    expect(await treasury.owner()).to.equal(await timelock.getAddress());
    expect(await treasury.balance()).to.equal(ethers.parseEther("10"));
    expect(await timelock.hasRole(await timelock.PROPOSER_ROLE(), await governor.getAddress())).to.equal(true);
    expect(await timelock.hasRole(await timelock.CANCELLER_ROLE(), await governor.getAddress())).to.equal(true);
    expect(await timelock.hasRole(await timelock.EXECUTOR_ROLE(), ethers.ZeroAddress)).to.equal(true);
    expect(await timelock.hasRole(await timelock.DEFAULT_ADMIN_ROLE(), deployer.address)).to.equal(false);
  });

  it("runs propose -> vote -> Succeeded -> queue -> delay -> execute and transfers ETH", async function () {
    const { voter, recipient, governor, treasury } = await deploySystem();
    const amount = ethers.parseEther("1");
    const calldata = treasury.interface.encodeFunctionData("transferETH", [recipient.address, amount]);
    const description = "Transfer 1 ETH from treasury";
    const { proposalId, descriptionHash } = await passAndQueue(governor, voter, [await treasury.getAddress()], [0n], [calldata], description);
    await time.increase(MIN_DELAY + 1);
    const before = await ethers.provider.getBalance(recipient.address);
    await (await governor.execute([await treasury.getAddress()], [0n], [calldata], descriptionHash)).wait();
    expect(await ethers.provider.getBalance(recipient.address)).to.equal(before + amount);
    expect(await treasury.balance()).to.equal(ethers.parseEther("9"));
    expect(await governor.state(proposalId)).to.equal(7n);
  });

  it("upgrades Treasury V1 to V2 through governance and preserves proxy address, owner and ETH balance", async function () {
    const { voter, governor, treasury, timelock } = await deploySystem();
    const proxyAddress = await treasury.getAddress();
    const balanceBefore = await treasury.balance();
    const TreasuryV2 = await ethers.getContractFactory("TreasuryV2");
    const v2Implementation = await TreasuryV2.deploy();
    await v2Implementation.waitForDeployment();
    const calldata = treasury.interface.encodeFunctionData("upgradeToAndCall", [await v2Implementation.getAddress(), "0x"]);
    const description = "Upgrade treasury to V2";
    const { proposalId, descriptionHash } = await passAndQueue(governor, voter, [proxyAddress], [0n], [calldata], description);
    await time.increase(MIN_DELAY + 1);
    await (await governor.execute([proxyAddress], [0n], [calldata], descriptionHash)).wait();
    const upgraded = TreasuryV2.attach(proxyAddress);
    expect(await upgraded.getAddress()).to.equal(proxyAddress);
    expect(await upgraded.owner()).to.equal(await timelock.getAddress());
    expect(await upgraded.balance()).to.equal(balanceBefore);
    expect(await upgraded.version()).to.equal(2n);
    expect(await governor.state(proposalId)).to.equal(7n);
  });

  it("prevents direct EOA Treasury transfer and upgrade", async function () {
    const { voter, treasury } = await deploySystem();
    await expect(treasury.connect(voter).transferETH(voter.address, ethers.parseEther("1"))).to.be.revertedWithCustomError(treasury, "OwnableUnauthorizedAccount");
    const TreasuryV2 = await ethers.getContractFactory("TreasuryV2");
    const implementation = await TreasuryV2.deploy();
    await implementation.waitForDeployment();
    await expect(treasury.connect(voter).upgradeToAndCall(await implementation.getAddress(), "0x")).to.be.revertedWithCustomError(treasury, "OwnableUnauthorizedAccount");
  });

  it("does not execute a queued proposal before the timelock delay", async function () {
    const { voter, recipient, governor, treasury } = await deploySystem();
    const calldata = treasury.interface.encodeFunctionData("transferETH", [recipient.address, ethers.parseEther("1")]);
    const description = "Early execution must fail";
    const { descriptionHash } = await passAndQueue(governor, voter, [await treasury.getAddress()], [0n], [calldata], description);
    await expect(governor.execute([await treasury.getAddress()], [0n], [calldata], descriptionHash)).to.be.reverted;
  });

  it("rejects Treasury transfers that exceed its balance", async function () {
    const { voter, recipient, governor, treasury } = await deploySystem();
    const calldata = treasury.interface.encodeFunctionData("transferETH", [recipient.address, ethers.parseEther("11")]);
    const description = "Insufficient treasury balance";
    const { descriptionHash } = await passAndQueue(governor, voter, [await treasury.getAddress()], [0n], [calldata], description);
    await time.increase(MIN_DELAY + 1);
    await expect(governor.execute([await treasury.getAddress()], [0n], [calldata], descriptionHash)).to.be.revertedWith("Treasury: insufficient funds");
  });

  it("defeats a proposal when nobody votes", async function () {
    const { voter, recipient, governor, treasury } = await deploySystem();
    const calldata = treasury.interface.encodeFunctionData("transferETH", [recipient.address, ethers.parseEther("1")]);
    const description = "No votes means defeated";
    const { proposalId } = await proposal(governor, voter, [await treasury.getAddress()], [0n], [calldata], description);
    await mine(VOTING_DELAY + VOTING_PERIOD + 2);
    expect(await governor.state(proposalId)).to.equal(3n);
  });

  it("supports Against and Abstain vote choices", async function () {
    const { voter, governor, treasury, recipient } = await deploySystem();
    const descriptions = ["Against vote", "Abstain vote"];
    for (let i = 0; i < descriptions.length; i++) {
      const calldata = treasury.interface.encodeFunctionData("transferETH", [recipient.address, ethers.parseEther("1")]);
      const { proposalId } = await proposal(governor, voter, [await treasury.getAddress()], [0n], [calldata], descriptions[i]);
      await mine(VOTING_DELAY + 1);
      await (await governor.connect(voter).castVote(proposalId, i === 0 ? 0 : 2)).wait();
      await mine(VOTING_PERIOD + 1);
      expect(await governor.state(proposalId)).to.equal(3n);
    }
  });

  it("blocks non-governor accounts from creating Timelock operations", async function () {
    const { outsider, timelock } = await deploySystem();
    const salt = ethers.id("unauthorized");
    await expect(timelock.connect(outsider).schedule(outsider.address, 0, "0x", ethers.ZeroHash, salt, MIN_DELAY)).to.be.reverted;
  });
});
