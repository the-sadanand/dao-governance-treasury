import { ethers, upgrades } from "hardhat";
import { expect } from "chai";
import { mine, time } from "@nomicfoundation/hardhat-network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { GovernanceToken, MyGovernor, Treasury, TreasuryV2, TimelockController } from "../typechain-types";

describe("DAO Governance", function () {
  let deployer: HardhatEthersSigner;
  let addr1: HardhatEthersSigner;
  let addr2: HardhatEthersSigner;
  let addr3: HardhatEthersSigner;
  let recipient: HardhatEthersSigner;
  
  let governanceToken: GovernanceToken;
  let timelock: TimelockController;
  let governor: MyGovernor;
  let treasury: Treasury;
  
  let govTokenAddr: string;
  let timelockAddr: string;
  let governorAddr: string;
  let treasuryAddr: string;

  const VOTING_DELAY = 1n;
  const VOTING_PERIOD = 10n;
  const PROPOSAL_THRESHOLD = 0n;
  const QUORUM_PERCENTAGE = 4n;
  const MIN_DELAY = 3600n;
  const MINT_AMOUNT = ethers.parseEther("1000");

  beforeEach(async function () {
    [deployer, addr1, addr2, addr3, recipient] = await ethers.getSigners();

    // Deploy GovernanceToken
    const GovernanceTokenFactory = await ethers.getContractFactory("GovernanceToken");
    governanceToken = await upgrades.deployProxy(GovernanceTokenFactory, [deployer.address], { kind: "uups" }) as unknown as GovernanceToken;
    await governanceToken.waitForDeployment();
    govTokenAddr = await governanceToken.getAddress();

    // Mint and delegate tokens
    await governanceToken.mint(deployer.address, MINT_AMOUNT);
    await governanceToken.mint(addr1.address, MINT_AMOUNT);
    await governanceToken.mint(addr2.address, MINT_AMOUNT);
    await governanceToken.mint(addr3.address, MINT_AMOUNT);

    await governanceToken.connect(deployer).delegate(deployer.address);
    await governanceToken.connect(addr1).delegate(addr1.address);
    await governanceToken.connect(addr2).delegate(addr2.address);
    await governanceToken.connect(addr3).delegate(addr3.address);

    // Deploy TimelockController
    const TimelockFactory = await ethers.getContractFactory("TimelockController");
    timelock = await TimelockFactory.deploy(MIN_DELAY, [], [ethers.ZeroAddress], deployer.address);
    await timelock.waitForDeployment();
    timelockAddr = await timelock.getAddress();

    // Deploy MyGovernor
    const GovernorFactory = await ethers.getContractFactory("MyGovernor");
    governor = await GovernorFactory.deploy(
      govTokenAddr,
      timelockAddr,
      VOTING_DELAY,
      VOTING_PERIOD,
      PROPOSAL_THRESHOLD,
      QUORUM_PERCENTAGE
    );
    await governor.waitForDeployment();
    governorAddr = await governor.getAddress();

    // Deploy Treasury
    const TreasuryFactory = await ethers.getContractFactory("Treasury");
    treasury = await upgrades.deployProxy(TreasuryFactory, [timelockAddr], { kind: "uups" }) as unknown as Treasury;
    await treasury.waitForDeployment();
    treasuryAddr = await treasury.getAddress();

    // Setup roles
    const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
    const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
    const DEFAULT_ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();

    await timelock.grantRole(PROPOSER_ROLE, governorAddr);
    await timelock.grantRole(CANCELLER_ROLE, governorAddr);
    await timelock.renounceRole(DEFAULT_ADMIN_ROLE, deployer.address);

    // Fund Treasury
    await deployer.sendTransaction({ to: treasuryAddr, value: ethers.parseEther("10") });
  });

  describe("1. Deployment & Configuration", function () {
    it("GovernanceToken name is MyGovToken, symbol is MGT, decimals is 18", async function () {
      expect(await governanceToken.name()).to.equal("MyGovToken");
      expect(await governanceToken.symbol()).to.equal("MGT");
      expect(await governanceToken.decimals()).to.equal(18);
    });

    it("GovernanceToken has delegate and getVotes functions", async function () {
      expect(typeof governanceToken.delegate).to.equal("function");
      expect(typeof governanceToken.getVotes).to.equal("function");
    });

    it("MyGovernor name is MyGovernor", async function () {
      expect(await governor.name()).to.equal("MyGovernor");
    });

    it("MyGovernor token() returns governance token address", async function () {
      expect(await governor.token()).to.equal(govTokenAddr);
    });

    it("MyGovernor timelock() returns timelock address", async function () {
      expect(await governor.timelock()).to.equal(timelockAddr);
    });

    it("votingDelay() returns 1", async function () {
      expect(await governor.votingDelay()).to.equal(VOTING_DELAY);
    });

    it("votingPeriod() returns 10", async function () {
      expect(await governor.votingPeriod()).to.equal(VOTING_PERIOD);
    });

    it("proposalThreshold() returns 0", async function () {
      expect(await governor.proposalThreshold()).to.equal(PROPOSAL_THRESHOLD);
    });

    it("TimelockController PROPOSER_ROLE granted to governor", async function () {
      const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
      expect(await timelock.hasRole(PROPOSER_ROLE, governorAddr)).to.be.true;
    });

    it("TimelockController EXECUTOR_ROLE granted to zero address", async function () {
      const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
      expect(await timelock.hasRole(EXECUTOR_ROLE, ethers.ZeroAddress)).to.be.true;
    });

    it("Deployer has renounced DEFAULT_ADMIN_ROLE on timelock", async function () {
      const DEFAULT_ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();
      expect(await timelock.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)).to.be.false;
    });

    it("Treasury owner() is timelock address", async function () {
      expect(await treasury.owner()).to.equal(timelockAddr);
    });
  });

  describe("2. Proposal Creation", function () {
    it("A user with voting power can create a proposal, emitting ProposalCreated event, state is Pending (0)", async function () {
      const transferAmount = ethers.parseEther("1");
      const transferCalldata = treasury.interface.encodeFunctionData("transferFunds", [recipient.address, transferAmount]);
      const description = "Proposal #1: Fund project X";

      const tx = await governor.connect(addr1).propose(
        [treasuryAddr],
        [0],
        [transferCalldata],
        description
      );
      
      const receipt = await tx.wait();
      const event = receipt!.logs.find(log => {
        try {
          return governor.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "ProposalCreated";
        } catch { return false; }
      });
      const parsedEvent = governor.interface.parseLog({ topics: [...event!.topics], data: event!.data });
      const proposalId = parsedEvent!.args.proposalId;

      expect(parsedEvent?.name).to.equal("ProposalCreated");
      expect(await governor.state(proposalId)).to.equal(0n); // Pending
    });
  });

  describe("3. Voting", function () {
    let proposalId: bigint;

    beforeEach(async function () {
      const transferAmount = ethers.parseEther("1");
      const transferCalldata = treasury.interface.encodeFunctionData("transferFunds", [recipient.address, transferAmount]);
      const description = "Proposal #1: Fund project X";

      const tx = await governor.propose(
        [treasuryAddr],
        [0],
        [transferCalldata],
        description
      );
      const receipt = await tx.wait();
      const event = receipt!.logs.find(log => {
        try {
          return governor.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "ProposalCreated";
        } catch { return false; }
      });
      const parsedEvent = governor.interface.parseLog({ topics: [...event!.topics], data: event!.data });
      proposalId = parsedEvent!.args.proposalId;
    });

    it("Proposal becomes Active (1) after voting delay, can cast votes, proposalVotes returns correct tallies", async function () {
      await mine(Number(VOTING_DELAY) + 1);
      expect(await governor.state(proposalId)).to.equal(1n); // Active

      // Token holders cast For (1), Against (0), and Abstain (2) votes
      await governor.connect(addr1).castVote(proposalId, 1); // For
      await governor.connect(addr2).castVote(proposalId, 0); // Against
      await governor.connect(addr3).castVote(proposalId, 2); // Abstain

      const votes = await governor.proposalVotes(proposalId);
      expect(votes[0]).to.equal(MINT_AMOUNT); // againstVotes
      expect(votes[1]).to.equal(MINT_AMOUNT); // forVotes
      expect(votes[2]).to.equal(MINT_AMOUNT); // abstainVotes
    });
  });

  describe("4. Proposal Success & Queue", function () {
    let proposalId: bigint;
    let descriptionHash: string;
    let transferCalldata: string;

    beforeEach(async function () {
      const transferAmount = ethers.parseEther("1");
      transferCalldata = treasury.interface.encodeFunctionData("transferFunds", [recipient.address, transferAmount]);
      const description = "Proposal #1: Fund project X";
      descriptionHash = ethers.id(description);

      const tx = await governor.propose(
        [treasuryAddr],
        [0],
        [transferCalldata],
        description
      );
      const receipt = await tx.wait();
      const event = receipt!.logs.find(log => {
        try {
          return governor.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "ProposalCreated";
        } catch { return false; }
      });
      const parsedEvent = governor.interface.parseLog({ topics: [...event!.topics], data: event!.data });
      proposalId = parsedEvent!.args.proposalId;
    });

    it("Proposal with more For than Against and meeting quorum becomes Succeeded (4) and can be Queued (5)", async function () {
      await mine(Number(VOTING_DELAY) + 1);

      await governor.connect(addr1).castVote(proposalId, 1); // For
      await governor.connect(addr2).castVote(proposalId, 1); // For

      await mine(Number(VOTING_PERIOD) + 1);
      
      expect(await governor.state(proposalId)).to.equal(4n); // Succeeded

      await governor.queue(
        [treasuryAddr],
        [0],
        [transferCalldata],
        descriptionHash
      );

      expect(await governor.state(proposalId)).to.equal(5n); // Queued
    });
  });

  describe("5. Proposal Execution", function () {
    let proposalId: bigint;
    let descriptionHash: string;
    let transferCalldata: string;

    beforeEach(async function () {
      const transferAmount = ethers.parseEther("1");
      transferCalldata = treasury.interface.encodeFunctionData("transferFunds", [recipient.address, transferAmount]);
      const description = "Proposal #1: Fund project X";
      descriptionHash = ethers.id(description);

      const tx = await governor.propose(
        [treasuryAddr],
        [0],
        [transferCalldata],
        description
      );
      const receipt = await tx.wait();
      const event = receipt!.logs.find(log => {
        try {
          return governor.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "ProposalCreated";
        } catch { return false; }
      });
      const parsedEvent = governor.interface.parseLog({ topics: [...event!.topics], data: event!.data });
      proposalId = parsedEvent!.args.proposalId;

      await mine(Number(VOTING_DELAY) + 1);
      await governor.connect(addr1).castVote(proposalId, 1); // For
      await governor.connect(deployer).castVote(proposalId, 1); // For (additional votes)
      await mine(Number(VOTING_PERIOD) + 1);
      
      await governor.queue(
        [treasuryAddr],
        [0],
        [transferCalldata],
        descriptionHash
      );
    });

    it("Queued proposal can be executed after timelock delay, Treasury funds are transferred, state becomes Executed (6)", async function () {
      // Verify state is Queued before proceeding
      expect(await governor.state(proposalId)).to.equal(5n); // Queued
      
      await time.increase(Number(MIN_DELAY) + 1);
      
      // Check state after time increase
      const stateAfterTime = await governor.state(proposalId);
      expect(stateAfterTime).to.equal(5n); // Should still be Queued

      const balanceBefore = await ethers.provider.getBalance(recipient.address);

      const executeTx = await governor.execute(
        [treasuryAddr],
        [0],
        [transferCalldata],
        descriptionHash
      );
      const receipt = await executeTx.wait();
      
      // Check if ProposalExecuted event was emitted
      const executedEvent = receipt!.logs.find(log => {
        try {
          return governor.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "ProposalExecuted";
        } catch { return false; }
      });
      expect(executedEvent).to.not.be.undefined;

      expect(await governor.state(proposalId)).to.equal(7n); // Executed (OZ v5: Executed=7)
      
      const balanceAfter = await ethers.provider.getBalance(recipient.address);
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("1"));
    });
  });

  describe("6. Proposal Defeat", function () {
    let proposalId: bigint;

    beforeEach(async function () {
      const transferAmount = ethers.parseEther("1");
      const transferCalldata = treasury.interface.encodeFunctionData("transferFunds", [recipient.address, transferAmount]);
      const description = "Proposal #1: Fund project X";

      const tx = await governor.propose(
        [treasuryAddr],
        [0],
        [transferCalldata],
        description
      );
      const receipt = await tx.wait();
      const event = receipt!.logs.find(log => {
        try {
          return governor.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "ProposalCreated";
        } catch { return false; }
      });
      const parsedEvent = governor.interface.parseLog({ topics: [...event!.topics], data: event!.data });
      proposalId = parsedEvent!.args.proposalId;
    });

    it("Proposal with more Against votes is Defeated (3)", async function () {
      await mine(Number(VOTING_DELAY) + 1);
      await governor.connect(addr1).castVote(proposalId, 0); // Against
      await governor.connect(addr2).castVote(proposalId, 1); // For
      await governor.connect(addr3).castVote(proposalId, 0); // Against
      await mine(Number(VOTING_PERIOD) + 1);
      
      expect(await governor.state(proposalId)).to.equal(3n); // Defeated
    });

    it("Proposal that doesn't meet quorum is Defeated (3)", async function () {
      const transferAmount = ethers.parseEther("1");
      const transferCalldata = treasury.interface.encodeFunctionData("transferFunds", [recipient.address, transferAmount]);
      const description = "Proposal #2: Try again";
      const tx = await governor.propose(
        [treasuryAddr],
        [0],
        [transferCalldata],
        description
      );
      const receipt = await tx.wait();
      const event = receipt!.logs.find(log => {
        try {
          return governor.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "ProposalCreated";
        } catch { return false; }
      });
      const parsedEvent = governor.interface.parseLog({ topics: [...event!.topics], data: event!.data });
      const newProposalId = parsedEvent!.args.proposalId;

      await mine(Number(VOTING_DELAY) + 1);
      // No votes cast
      await mine(Number(VOTING_PERIOD) + 1);

      expect(await governor.state(newProposalId)).to.equal(3n); // Defeated
    });
  });

  describe("7. Treasury Upgradeability", function () {
    it("should upgrade Treasury to V2 while preserving state", async function () {
      // Deploy a separate treasury with deployer as owner for upgrade testing
      const TreasuryFactory = await ethers.getContractFactory("Treasury");
      const testTreasury = await upgrades.deployProxy(
        TreasuryFactory,
        [deployer.address],
        { kind: "uups" }
      );
      await testTreasury.waitForDeployment();
      const testTreasuryAddr = await testTreasury.getAddress();
      
      // Send 1 ETH
      await deployer.sendTransaction({ to: testTreasuryAddr, value: ethers.parseEther("1") });
      expect(await ethers.provider.getBalance(testTreasuryAddr)).to.equal(ethers.parseEther("1"));
      
      // Upgrade to V2
      const TreasuryV2Factory = await ethers.getContractFactory("TreasuryV2");
      const upgraded = await upgrades.upgradeProxy(testTreasuryAddr, TreasuryV2Factory, { kind: "uups" });
      
      // Verify version
      const treasuryV2 = await ethers.getContractAt("TreasuryV2", testTreasuryAddr);
      expect(await treasuryV2.version()).to.equal("v2");
      
      // Verify balance preserved
      expect(await ethers.provider.getBalance(testTreasuryAddr)).to.equal(ethers.parseEther("1"));
    });
  });
});
