import type { ChainConfig, ChainWriteMode, RuleSettings } from "./types";

export const chainConfig: ChainConfig = {
  chainId: Number(process.env.CHAIN_ID ?? 11155111),
  rpcUrl: process.env.EVM_RPC_URL ?? "https://sepolia.infura.io/v3/YOUR_PROJECT_ID",
  contractAddress: process.env.REPUTATION_CONTRACT_ADDRESS,
  explorerBaseUrl: process.env.EXPLORER_BASE_URL ?? "https://sepolia.etherscan.io"
};

export const defaultRules: RuleSettings = {
  vipTokenThreshold: 10,
  nftTrustBonus: 8,
  newWalletPenalty: 20,
  spamPenalty: 30,
  spamTerms: ["airdrop", "空投", "加群", "稳赚", "私聊", "http://", "https://t.me"],
  scamTerms: ["助记词", "private key", "seed phrase", "授权全部", "claim now"],
  fudTerms: ["提现困难", "不能提现", "跑路", "崩盘", "资金盘", "rug"]
};

const rawChainWriteMode = process.env.CHAIN_WRITE_MODE ?? "manual";
const chainWriteMode: ChainWriteMode =
  rawChainWriteMode === "off" || rawChainWriteMode === "auto_confirmed" ? rawChainWriteMode : "manual";

function parseTrustedGuildIds() {
  return (process.env.TRUSTED_GUILD_IDS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export const appConfig = {
  databaseUrl: process.env.DATABASE_URL ?? "file:./data/community.json",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  discordClientId: process.env.DISCORD_CLIENT_ID,
  discordGuildId: process.env.DISCORD_GUILD_ID,
  discordAdminChannelId: process.env.DISCORD_ADMIN_CHANNEL_ID,
  trustedGuildIds: parseTrustedGuildIds(),
  adminDashboardPassword: process.env.ADMIN_DASHBOARD_PASSWORD,
  demoMode: process.env.DEMO_MODE !== "false",
  chainWriteMode,
  serviceWalletPrivateKey: process.env.SERVICE_WALLET_PRIVATE_KEY,
  vipTokenAddress: process.env.VIP_TOKEN_ADDRESS,
  vipTokenDecimals: Number(process.env.VIP_TOKEN_DECIMALS ?? 18),
  vipNftAddress: process.env.VIP_NFT_ADDRESS,
  llm: {
    apiKey: process.env.LLM_API_KEY,
    baseUrl: process.env.LLM_BASE_URL ?? "https://api.openai.com/v1",
    model: process.env.LLM_MODEL ?? "gpt-4o-mini"
  },
  defaultRules
};

export function isTrustedGuild(guildId?: string) {
  if (!guildId) return false;
  return appConfig.trustedGuildIds.includes(guildId);
}

export function defaultGuildId(guildId?: string) {
  return guildId || appConfig.discordGuildId || "demo-guild";
}

export function explorerAddressUrl(address?: string) {
  if (!address || !chainConfig.explorerBaseUrl) {
    return undefined;
  }
  return `${chainConfig.explorerBaseUrl.replace(/\/$/, "")}/address/${address}`;
}

export function explorerTxUrl(txHash?: string) {
  if (!txHash || !chainConfig.explorerBaseUrl) {
    return undefined;
  }
  return `${chainConfig.explorerBaseUrl.replace(/\/$/, "")}/tx/${txHash}`;
}
