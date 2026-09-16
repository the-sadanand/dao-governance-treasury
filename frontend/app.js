const CONFIG = {
  chainId: 11155111n,
  token: "",
  governor: "",
  timelock: "",
  treasury: ""
};

const tokenAbi = [
  "function balanceOf(address) view returns (uint256)",
  "function getVotes(address) view returns (uint256)",
  "function delegate(address) returns (bool)"
];
const treasuryAbi = ["function balance() view returns (uint256)", "function transferETH(address,uint256)"];
const governorAbi = [
  "function propose(address[],uint256[],bytes[],string) returns (uint256)",
  "function hashProposal(address[],uint256[],bytes[],bytes32) view returns (uint256)",
  "function castVote(uint256,uint8) returns (uint256)"
];

let provider;
let signer;
let tokenContract;
let governorContract;
let treasuryContract;

const $ = (id) => document.getElementById(id);
const setStatus = (text) => $("status").textContent = text;

async function connect() {
  if (!window.ethereum) return setStatus("Install MetaMask or another injected wallet.");
  if (!CONFIG.token || !CONFIG.governor || !CONFIG.treasury) return setStatus("Set the Sepolia contract addresses in frontend/app.js first.");
  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();
  const network = await provider.getNetwork();
  if (network.chainId !== CONFIG.chainId) return setStatus("Please switch your wallet to Sepolia.");

  const address = await signer.getAddress();
  tokenContract = new ethers.Contract(CONFIG.token, tokenAbi, signer);
  governorContract = new ethers.Contract(CONFIG.governor, governorAbi, signer);
  treasuryContract = new ethers.Contract(CONFIG.treasury, treasuryAbi, signer);

  $("network").textContent = "Sepolia";
  $("token").value = CONFIG.token;
  $("governor").value = CONFIG.governor;
  $("timelock").value = CONFIG.timelock;
  $("treasuryAddress").value = CONFIG.treasury;
  $("connect").textContent = `${address.slice(0, 6)}...${address.slice(-4)}`;
  $("propose").disabled = false;
  await refresh(address);
}

async function refresh(address) {
  const [balance, votes, treasuryBalance] = await Promise.all([
    tokenContract.balanceOf(address),
    tokenContract.getVotes(address),
    treasuryContract.balance()
  ]);
  $("balance").textContent = `${ethers.formatEther(balance)} TGT`;
  $("votes").textContent = ethers.formatEther(votes);
  $("treasury").textContent = `${ethers.formatEther(treasuryBalance)} ETH`;
  setStatus("Wallet connected. Governance actions are sent on-chain.");
}

async function proposeTransfer() {
  const recipient = $("recipient").value.trim();
  const amount = $("amount").value.trim();
  if (!ethers.isAddress(recipient) || !amount || Number(amount) <= 0) return setStatus("Enter a valid recipient and positive ETH amount.");

  const calldata = treasuryContract.interface.encodeFunctionData("transferETH", [recipient, ethers.parseEther(amount)]);
  const description = `Transfer ${amount} ETH from treasury to ${recipient}`;
  setStatus("Submitting proposal transaction...");
  const tx = await governorContract.propose([CONFIG.treasury], [0n], [calldata], description);
  await tx.wait();
  setStatus("Proposal created. Voting and timelock steps must now be completed.");
}

$("connect").addEventListener("click", () => connect().catch((e) => setStatus(e.shortMessage || e.message)));
$("propose").addEventListener("click", () => proposeTransfer().catch((e) => setStatus(e.shortMessage || e.message)));
