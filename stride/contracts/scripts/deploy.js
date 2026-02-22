const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying from wallet:", deployer.address);

  const ORACLE_ADDRESS = "0x6C16351D940d1c35dc5B7E5e6e44Ae1E3F4f5283";

  const StridePool = await ethers.getContractFactory("StridePool");
  const contract = await StridePool.deploy(ORACLE_ADDRESS);
  await contract.deployed(); // ← v5 syntax (not waitForDeployment)

  console.log("✅ StridePool deployed to:", contract.address); // ← v5 syntax (not getAddress)
  console.log("📋 Save this address!");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
