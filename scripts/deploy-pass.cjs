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
  const tokenUri = process.env.PASS_TOKEN_URI || "https://example.com/member-pass.json";

  console.log(`Deploying MemberPassNFT to ${networkName} (${chainId}) from ${deployer.address}`);

  const MemberPassNFT = await hre.ethers.getContractFactory("MemberPassNFT");
  const pass = await MemberPassNFT.deploy(tokenUri);
  await pass.waitForDeployment();

  const address = await pass.getAddress();
  const artifact = await hre.artifacts.readArtifact("MemberPassNFT");
  const outputDir = join(process.cwd(), "deployments");
  const fileName = `${networkName}-member-pass-nft.json`;
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    join(outputDir, fileName),
    JSON.stringify(
      {
        network: networkName,
        chainId,
        contractAddress: address,
        tokenUri,
        explorerBaseUrl,
        abi: artifact.abi
      },
      null,
      2
    )
  );

  console.log(`MemberPassNFT deployed to ${address}`);
  console.log(`Deployment file: deployments/${fileName}`);
  if (explorerBaseUrl) {
    console.log(`Explorer: ${explorerBaseUrl}/address/${address}`);
  }
  console.log("Copy this into .env.local and restart the app:");
  console.log(`VIP_NFT_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
