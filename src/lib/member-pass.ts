import { ethers } from "ethers";
import { appConfig, chainConfig, defaultGuildId, explorerTxUrl, isTrustedGuild } from "./config";
import { createId } from "./security";
import {
  addMemberPassIssuance,
  findBinding,
  getHoldings,
  store,
  upsertHoldings
} from "./store";
import type { HoldingSnapshot, MemberPassCandidate, MemberPassCandidateGroups, MemberPassIssuance } from "./types";

const memberPassAbi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function mint(address to) returns (uint256)"
];

function provider() {
  return new ethers.JsonRpcProvider(chainConfig.rpcUrl);
}

function mergePassHolding(walletAddress: string, nftCount: number, source: HoldingSnapshot["source"] = "onchain") {
  const current = getHoldings(walletAddress);
  const updated: HoldingSnapshot = {
    ...current,
    nftCount,
    source,
    updatedAt: new Date().toISOString()
  };
  upsertHoldings(walletAddress, updated);
  return updated;
}

async function readPassBalance(walletAddress: string) {
  if (!appConfig.vipNftAddress) {
    throw new Error("VIP_NFT_ADDRESS is not configured.");
  }

  const pass = new ethers.Contract(appConfig.vipNftAddress, memberPassAbi, provider());
  return Number(await pass.balanceOf(walletAddress));
}

export async function getMemberPassStatus(walletAddress: string) {
  const cached = getHoldings(walletAddress);

  if (!appConfig.vipNftAddress) {
    return {
      hasPass: cached.nftCount > 0,
      holdingSource: cached.source,
      error: "VIP_NFT_ADDRESS 未配置，当前只显示本地缓存/模拟状态。"
    };
  }

  try {
    const balance = await readPassBalance(walletAddress);
    const holdings = mergePassHolding(walletAddress, balance > 0 ? 1 : 0);
    return { hasPass: balance > 0, holdingSource: holdings.source };
  } catch (error) {
    return {
      hasPass: cached.nftCount > 0,
      holdingSource: cached.source,
      error: error instanceof Error ? error.message : "读取社区通行证失败"
    };
  }
}

function candidateFromCache(binding: { guildId: string; discordId: string; walletAddress: string; boundAt: string }): MemberPassCandidate {
  const holdings = getHoldings(binding.walletAddress);
  return {
    guildId: binding.guildId,
    discordId: binding.discordId,
    walletAddress: binding.walletAddress,
    hasPass: holdings.nftCount > 0,
    holdingSource: holdings.source,
    lastBoundAt: binding.boundAt,
    updatedAt: holdings.updatedAt
  };
}

export function listMemberPassCandidates(guildId = defaultGuildId()): MemberPassCandidateGroups {
  const uniqueBindings = Array.from(
    new Map(
      store.bindings
        .filter((binding) => binding.guildId === guildId)
        .map((binding) => [`${binding.guildId}:${binding.discordId}`, binding])
    ).values()
  );

  const candidates = uniqueBindings.map(candidateFromCache);
  return {
    withoutPass: candidates.filter((candidate) => !candidate.hasPass).slice(0, 10),
    withPass: candidates.filter((candidate) => candidate.hasPass).slice(0, 10)
  };
}

export async function refreshMemberPassForUser(input: { guildId?: string; discordId: string }) {
  const guildId = defaultGuildId(input.guildId);
  const binding = findBinding(input.discordId, guildId);

  if (!isTrustedGuild(guildId)) {
    throw new Error("Only trusted guilds can issue the global community pass.");
  }

  if (!binding) {
    throw new Error("该用户还没有绑定钱包，不能刷新通行证状态。");
  }

  const status = await getMemberPassStatus(binding.walletAddress);
  return {
    guildId,
    discordId: input.discordId,
    walletAddress: binding.walletAddress,
    ...status
  };
}

export async function issueMemberPass(input: {
  guildId?: string;
  discordId: string;
  adminId: string;
}) {
  const guildId = defaultGuildId(input.guildId);
  const binding = findBinding(input.discordId, guildId);

  if (!binding) {
    throw new Error("该用户还没有绑定钱包，不能发放社区通行证。");
  }

  if (!appConfig.vipNftAddress) {
    throw new Error("VIP_NFT_ADDRESS 未配置，请先部署 MemberPassNFT 并填入 .env.local。");
  }

  if (!appConfig.serviceWalletPrivateKey) {
    throw new Error("SERVICE_WALLET_PRIVATE_KEY 未配置，后端没有权限发放通行证。");
  }

  const currentBalance = await readPassBalance(binding.walletAddress);
  if (currentBalance > 0) {
    mergePassHolding(binding.walletAddress, 1);
    throw new Error("该用户已经持有社区通行证，不能重复发放。");
  }

  const createdAt = new Date().toISOString();

  try {
    const wallet = new ethers.Wallet(appConfig.serviceWalletPrivateKey, provider());
    const pass = new ethers.Contract(appConfig.vipNftAddress, memberPassAbi, wallet);
    const tx = await pass.mint(binding.walletAddress);
    const receipt = await tx.wait();
    const txHash = receipt?.hash as string | undefined;
    mergePassHolding(binding.walletAddress, 1);

    const issuance: MemberPassIssuance = {
      id: createId("pass"),
      guildId,
      discordId: input.discordId,
      walletAddress: binding.walletAddress,
      txHash,
      status: "success",
      adminId: input.adminId,
      createdAt
    };
    addMemberPassIssuance(issuance);

    return {
      issuance,
      explorerUrl: explorerTxUrl(txHash)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "发放社区通行证失败";
    const issuance: MemberPassIssuance = {
      id: createId("pass"),
      guildId,
      discordId: input.discordId,
      walletAddress: binding.walletAddress,
      status: "failed",
      error: message,
      adminId: input.adminId,
      createdAt
    };
    addMemberPassIssuance(issuance);
    throw new Error(message);
  }
}
