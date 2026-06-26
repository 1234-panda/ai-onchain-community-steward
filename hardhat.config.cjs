require("@nomicfoundation/hardhat-toolbox");
require("./scripts/load-env.cjs").loadEnv();

const serviceWalletPrivateKey = process.env.SERVICE_WALLET_PRIVATE_KEY;

/** @type import('hardhat/config').HardhatUserConfig */
const config = {
  solidity: "0.8.28",
  networks: {
    hardhat: {
      chainId: 31337
    },
    localhost: {
      url: process.env.EVM_RPC_URL ?? "http://127.0.0.1:8545",
      chainId: Number(process.env.CHAIN_ID ?? 31337)
    },
    sepolia: {
      url: process.env.EVM_RPC_URL ?? "",
      chainId: 11155111,
      accounts: serviceWalletPrivateKey ? [serviceWalletPrivateKey] : []
    }
  }
};

module.exports = config;
