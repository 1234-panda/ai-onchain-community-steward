const { writeFileSync, mkdirSync } = require("fs");
const { join } = require("path");
require("./load-env.cjs").loadEnv();
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();
  const networkName = hre.network.name === "localhost" ? "local" : hre.network.name;
  const chainId = Number(network.chainId);
  const explorerBaseUrl =
    process.env.EXPLORER_BASE_URL || (chainId === 11155111 ? "https://sepolia.etherscan.io" : "");

  console.log(`Deploying CommunityReputation to ${networkName} (${chainId}) from ${deployer.address}`);

  const CommunityReputation = await hre.ethers.getContractFactory("CommunityReputation");
  const contract = await CommunityReputation.deploy(deployer.address);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const artifact = await hre.artifacts.readArtifact("CommunityReputation");
  const outputDir = join(process.cwd(), "deployments");
  const fileName = `${networkName}-community-reputation.json`;
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    join(outputDir, fileName),
    JSON.stringify(
      {
        network: networkName,
        chainId,
        rpcUrl: process.env.EVM_RPC_URL ?? "",
        contractAddress: address,
        explorerBaseUrl,
        abi: artifact.abi
      },
      null,
      2
    )
  );

  console.log(`CommunityReputation deployed to ${address}`);
  console.log(`Deployment file: deployments/${fileName}`);
  if (explorerBaseUrl) {
    console.log(`Explorer: ${explorerBaseUrl}/address/${address}`);
  }
  console.log("Copy this into .env.local and restart the app:");
  console.log(`REPUTATION_CONTRACT_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
