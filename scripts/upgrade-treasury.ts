import { ethers, upgrades } from "hardhat";

async function main() {
  // Get the address of the deployed Treasury proxy
  // In a real scenario, you'd read this from a deployment file or env variable
  const TREASURY_PROXY_ADDRESS = process.env.TREASURY_PROXY_ADDRESS;

  if (!TREASURY_PROXY_ADDRESS) {
    console.error("Please set TREASURY_PROXY_ADDRESS environment variable");
    process.exit(1);
  }

  console.log("Upgrading Treasury at:", TREASURY_PROXY_ADDRESS);

  const TreasuryV2 = await ethers.getContractFactory("TreasuryV2");
  const upgraded = await upgrades.upgradeProxy(TREASURY_PROXY_ADDRESS, TreasuryV2, {
    kind: "uups",
  });

  await upgraded.waitForDeployment();
  console.log("Treasury upgraded to V2 at:", await upgraded.getAddress());

  // Verify the upgrade
  const version = await upgraded.version();
  console.log("Treasury version:", version);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
