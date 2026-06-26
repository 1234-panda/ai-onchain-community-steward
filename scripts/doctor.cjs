const required = ["DISCORD_BOT_TOKEN", "DISCORD_CLIENT_ID", "SERVICE_WALLET_PRIVATE_KEY"];
require("./load-env.cjs").loadEnv();
const { ethers } = require("ethers");

async function main() {
  let hasError = false;
  console.log("AI Community Steward doctor\n");
  for (const key of required) {
    const ok = Boolean(process.env[key]);
    console.log(`${ok ? "OK " : "MISS"} ${key}`);
    if (!ok) hasError = true;
  }

  for (const key of ["DISCORD_GUILD_ID", "DISCORD_ADMIN_CHANNEL_ID", "REPUTATION_CONTRACT_ADDRESS", "LLM_API_KEY"]) {
    console.log(`${process.env[key] ? "OK " : "WARN"} ${key}`);
  }

  if (!process.env.VIP_TOKEN_ADDRESS && !process.env.VIP_NFT_ADDRESS) {
    console.log("WARN VIP_TOKEN_ADDRESS/VIP_NFT_ADDRESS not set, holdings use simulated/cache mode.");
  }

  const expectedChainId = Number(process.env.CHAIN_ID || 11155111);
  const rpcUrl = process.env.EVM_RPC_URL;
  if (rpcUrl) {
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const network = await provider.getNetwork();
      const actualChainId = Number(network.chainId);
      console.log(`${actualChainId === expectedChainId ? "OK " : "MISS"} RPC chainId actual=${actualChainId} expected=${expectedChainId}`);
      if (actualChainId !== expectedChainId) hasError = true;

      if (process.env.SERVICE_WALLET_PRIVATE_KEY) {
        const wallet = new ethers.Wallet(process.env.SERVICE_WALLET_PRIVATE_KEY, provider);
        const balance = await provider.getBalance(wallet.address);
        console.log(`${balance > 0n ? "OK " : "WARN"} service wallet ${wallet.address} balance=${ethers.formatEther(balance)} ETH`);
      }
    } catch (error) {
      console.log(`MISS RPC check failed: ${error.message}`);
      hasError = true;
    }
  }

  if (process.env.EXPLORER_BASE_URL && process.env.REPUTATION_CONTRACT_ADDRESS) {
    console.log(`INFO contract: ${process.env.EXPLORER_BASE_URL.replace(/\/$/, "")}/address/${process.env.REPUTATION_CONTRACT_ADDRESS}`);
  }

  process.exitCode = hasError ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
