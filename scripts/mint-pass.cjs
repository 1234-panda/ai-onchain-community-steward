require("./load-env.cjs").loadEnv();
const hre = require("hardhat");

async function main() {
  const passAddress = process.env.VIP_NFT_ADDRESS;
  const recipient = process.env.PASS_RECIPIENT_ADDRESS;

  if (!passAddress) {
    throw new Error("VIP_NFT_ADDRESS is required. Deploy MemberPassNFT first.");
  }

  if (!recipient) {
    throw new Error("PASS_RECIPIENT_ADDRESS is required.");
  }

  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const explorerBaseUrl =
    process.env.EXPLORER_BASE_URL || (chainId === 11155111 ? "https://sepolia.etherscan.io" : "");
  const pass = await hre.ethers.getContractAt("MemberPassNFT", passAddress);
  const currentBalance = await pass.balanceOf(recipient);

  if (currentBalance > 0n) {
    throw new Error(`Recipient ${recipient} already has a member pass.`);
  }

  const tx = await pass.mint(recipient);
  const receipt = await tx.wait();
  console.log(`Minted member pass to ${recipient}`);
  console.log(`Transaction: ${receipt.hash}`);
  if (explorerBaseUrl) {
    console.log(`Explorer: ${explorerBaseUrl}/tx/${receipt.hash}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
