import { ethers } from "ethers";
import { chainConfig, appConfig, isTrustedGuild } from "./config";
import { ModerationEventType, OnchainReputation } from "./types";

const abi = [
  "function recordEvent(address wallet, bytes32 eventHash, uint8 eventType, int256 scoreDelta) external",
  "function batchRecordEvents(address[] wallets, bytes32[] eventHashes, uint8[] eventTypes, int256[] scoreDeltas) external",
  "function getReputation(address wallet) view returns (int256 score, uint256 eventCount)"
];

const reputationCache = new Map<string, { expiresAt: number; value: OnchainReputation }>();
const CACHE_MS = 60_000;

export function hashModerationEvent(input: {
  discordId: string;
  walletAddress?: string;
  eventType: ModerationEventType;
  scoreDelta: number;
  reason: string;
  createdAt: string;
}) {
  return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(input)));
}

export async function recordOnChain(input: {
  guildId?: string;
  walletAddress?: string;
  eventHash: string;
  eventType: ModerationEventType;
  scoreDelta: number;
}) {
  if (!isTrustedGuild(input.guildId)) {
    return undefined;
  }

  if (!input.walletAddress || !chainConfig.contractAddress || !appConfig.serviceWalletPrivateKey) {
    return undefined;
  }

  const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
  const wallet = new ethers.Wallet(appConfig.serviceWalletPrivateKey, provider);
  const contract = new ethers.Contract(chainConfig.contractAddress, abi, wallet);
  const tx = await contract.recordEvent(
    input.walletAddress,
    input.eventHash,
    input.eventType,
    input.scoreDelta
  );
  const receipt = await tx.wait();
  return receipt?.hash as string | undefined;
}

export async function recordBatchOnChain(input: {
  guildId?: string;
  records: Array<{
    walletAddress: string;
    eventHash: string;
    eventType: ModerationEventType;
    scoreDelta: number;
  }>;
}) {
  if (!isTrustedGuild(input.guildId)) {
    return undefined;
  }

  if (!input.records.length || !chainConfig.contractAddress || !appConfig.serviceWalletPrivateKey) {
    return undefined;
  }

  const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
  const wallet = new ethers.Wallet(appConfig.serviceWalletPrivateKey, provider);
  const contract = new ethers.Contract(chainConfig.contractAddress, abi, wallet);
  const tx = await contract.batchRecordEvents(
    input.records.map((record) => record.walletAddress),
    input.records.map((record) => record.eventHash),
    input.records.map((record) => record.eventType),
    input.records.map((record) => record.scoreDelta)
  );
  const receipt = await tx.wait();
  return receipt?.hash as string | undefined;
}

export async function getOnchainReputation(walletAddress?: string): Promise<OnchainReputation> {
  if (!walletAddress || !chainConfig.contractAddress) {
    return {
      score: 0,
      eventCount: 0,
      status: "not_configured"
    };
  }

  const key = `${chainConfig.chainId}:${chainConfig.contractAddress}:${walletAddress.toLowerCase()}`;
  const cached = reputationCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      ...cached.value,
      status: "cached"
    };
  }

  try {
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const contract = new ethers.Contract(chainConfig.contractAddress, abi, provider);
    const [score, eventCount] = (await contract.getReputation(walletAddress)) as [bigint, bigint];
    const value: OnchainReputation = {
      score: Number(score),
      eventCount: Number(eventCount),
      status: "success",
      updatedAt: new Date().toISOString()
    };
    reputationCache.set(key, { value, expiresAt: Date.now() + CACHE_MS });
    return value;
  } catch (error) {
    return {
      score: 0,
      eventCount: 0,
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown on-chain reputation error",
      updatedAt: new Date().toISOString()
    };
  }
}
