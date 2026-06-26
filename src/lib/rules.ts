import { defaultGuildId } from "./config";
import { getOnchainReputation } from "./reputation";
import { createId } from "./security";
import { findBinding, getBindingHistory, getHoldings, store } from "./store";
import {
  CommunityMessage,
  ModerationEventType,
  OnchainReputation,
  PendingEvent,
  ReviewMode,
  SignalSummary,
  SybilRisk,
  TrustBreakdown,
  UserProfile,
  WalletBindingHistory
} from "./types";

export function classifyMessage(content: string) {
  const normalized = content.toLowerCase();
  const isSpam = store.rules.spamTerms.some((term) => normalized.includes(term.toLowerCase()));
  const isScam = store.rules.scamTerms.some((term) => normalized.includes(term.toLowerCase()));
  const isFud = store.rules.fudTerms.some((term) => normalized.includes(term.toLowerCase()));

  if (isScam) {
    return {
      eventType: ModerationEventType.SCAM_SUSPECTED,
      scoreDelta: -50,
      reason: "疑似诈骗或危险授权话术"
    };
  }

  if (isSpam) {
    return {
      eventType: ModerationEventType.SPAM,
      scoreDelta: -store.rules.spamPenalty,
      reason: "疑似广告、拉群或诱导链接"
    };
  }

  if (isFud) {
    return {
      eventType: ModerationEventType.WARNING,
      scoreDelta: -5,
      reason: "涉及提现/FUD 讨论，需要管理员关注"
    };
  }

  return undefined;
}

export function createPositivePendingEvent(input: {
  guildId?: string;
  discordId: string;
  eventType: ModerationEventType.APPEAL_ACCEPTED | ModerationEventType.POSITIVE_CONTRIBUTION;
  reason?: string;
  messageSummary?: string;
  source?: "demo" | "discord";
}): PendingEvent {
  const guildId = defaultGuildId(input.guildId);
  const binding = findBinding(input.discordId, guildId);
  const scoreDelta = input.eventType === ModerationEventType.APPEAL_ACCEPTED ? 20 : 15;
  const reason =
    input.reason ??
    (input.eventType === ModerationEventType.APPEAL_ACCEPTED
      ? "申诉通过，恢复部分信誉"
      : "积极贡献，增加社区信誉");
  const messageSummary =
    input.messageSummary ??
    (input.eventType === ModerationEventType.APPEAL_ACCEPTED
      ? "管理员确认用户申诉成立，创建正向治理记录。"
      : "管理员记录该用户对社区有积极贡献，创建正向治理记录。");

  return {
    id: createId(input.eventType === ModerationEventType.APPEAL_ACCEPTED ? "pending_appeal" : "pending_positive"),
    guildId,
    discordId: input.discordId,
    walletAddress: binding?.walletAddress,
    eventType: input.eventType,
    scoreDelta,
    reason,
    messageSummary,
    source: input.source ?? "discord",
    createdAt: new Date().toISOString()
  };
}

export async function buildUserProfileAsync(discordId: string, guildId = defaultGuildId()): Promise<UserProfile> {
  const binding = findBinding(discordId, guildId);
  const bindingHistory = getBindingHistory(discordId, guildId);
  const holdings = getHoldings(binding?.walletAddress);
  const events = store.moderation.filter((event) => event.discordId === discordId && event.guildId === guildId);
  const localEventScore = events.reduce((sum, event) => sum + event.scoreDelta, 0);
  const localScore = Math.max(0, Math.min(100, 60 + localEventScore));
  const onchainReputation = await getOnchainReputation(binding?.walletAddress);
  const sybilRisk = calculateSybilRisk(discordId, guildId, binding?.walletAddress, holdings, onchainReputation, bindingHistory);
  const holdingScore = calculateHoldingScore(holdings.tokenBalance, holdings.nftCount);
  const newWalletPenalty = binding ? 0 : store.rules.newWalletPenalty;
  const onchainScoreContribution = boundOnchainScore(onchainReputation.score);
  const trustBreakdown: TrustBreakdown = {
    base: 60,
    holdingScore,
    localEventScore,
    onchainScoreContribution,
    sybilPenalty: sybilRisk.score,
    newWalletPenalty,
    final: 0
  };
  trustBreakdown.final = calculateFinalScore(trustBreakdown);
  const reviewMode = calculateReviewMode(
    trustBreakdown.final,
    binding?.walletAddress,
    holdings.tokenBalance,
    localEventScore,
    onchainReputation,
    sybilRisk
  );
  const signalSummary = summarizeSignals(events.length, localEventScore, onchainReputation, sybilRisk);
  const reviewExplanation = explainReview(binding?.walletAddress, reviewMode, signalSummary, onchainReputation, sybilRisk, events.length);
  const labels = buildLabels(binding?.walletAddress, reviewMode, holdings.source, events, onchainReputation, sybilRisk);

  return {
    guildId,
    discordId,
    walletAddress: binding?.walletAddress,
    reviewMode,
    trustScore: trustBreakdown.final,
    localScore,
    onchainReputation,
    sybilRisk,
    trustBreakdown,
    signalSummary,
    reviewExplanation,
    holdings,
    events,
    bindingHistory,
    labels
  };
}

export function buildUserProfile(discordId: string, guildId = defaultGuildId()): UserProfile {
  const binding = findBinding(discordId, guildId);
  const bindingHistory = getBindingHistory(discordId, guildId);
  const fallback: OnchainReputation = { score: 0, eventCount: 0, status: "not_configured" };
  const holdings = getHoldings(binding?.walletAddress);
  const events = store.moderation.filter((event) => event.discordId === discordId && event.guildId === guildId);
  const localEventScore = events.reduce((sum, event) => sum + event.scoreDelta, 0);
  const sybilRisk = calculateSybilRisk(discordId, guildId, binding?.walletAddress, holdings, fallback, bindingHistory);
  const holdingScore = calculateHoldingScore(holdings.tokenBalance, holdings.nftCount);
  const newWalletPenalty = binding ? 0 : store.rules.newWalletPenalty;
  const trustBreakdown: TrustBreakdown = {
    base: 60,
    holdingScore,
    localEventScore,
    onchainScoreContribution: 0,
    sybilPenalty: sybilRisk.score,
    newWalletPenalty,
    final: 0
  };
  trustBreakdown.final = calculateFinalScore(trustBreakdown);
  const reviewMode = calculateReviewMode(trustBreakdown.final, binding?.walletAddress, holdings.tokenBalance, localEventScore, fallback, sybilRisk);
  const signalSummary = summarizeSignals(events.length, localEventScore, fallback, sybilRisk);

  return {
    guildId,
    discordId,
    walletAddress: binding?.walletAddress,
    reviewMode,
    trustScore: trustBreakdown.final,
    localScore: Math.max(0, Math.min(100, 60 + localEventScore)),
    onchainReputation: fallback,
    sybilRisk,
    trustBreakdown,
    signalSummary,
    reviewExplanation: explainReview(binding?.walletAddress, reviewMode, signalSummary, fallback, sybilRisk, events.length),
    holdings,
    events,
    bindingHistory,
    labels: buildLabels(binding?.walletAddress, reviewMode, holdings.source, events, fallback, sybilRisk)
  };
}

export function createPendingEventFromMessage(message: CommunityMessage): PendingEvent | undefined {
  const classification = classifyMessage(message.content);
  if (!classification) return undefined;

  const binding = findBinding(message.discordId, message.guildId);
  return {
    id: `pending_${message.id}`,
    guildId: message.guildId,
    discordId: message.discordId,
    walletAddress: binding?.walletAddress,
    eventType: classification.eventType,
    scoreDelta: classification.scoreDelta,
    reason: classification.reason,
    messageSummary: message.content.slice(0, 160),
    source: message.source,
    createdAt: new Date().toISOString()
  };
}

function calculateHoldingScore(tokenBalance: number, nftCount: number) {
  if (tokenBalance >= store.rules.vipTokenThreshold) return 35;
  if (nftCount > 0) return store.rules.nftTrustBonus;
  return 0;
}

function calculateFinalScore(breakdown: TrustBreakdown) {
  return Math.max(
    0,
    Math.min(
      100,
      breakdown.base +
        breakdown.holdingScore +
        breakdown.localEventScore +
        breakdown.onchainScoreContribution -
        breakdown.sybilPenalty -
        breakdown.newWalletPenalty
    )
  );
}

function boundOnchainScore(score: number) {
  if (score < 0) return Math.max(-40, score);
  return Math.min(20, score);
}

function calculateReviewMode(
  final: number,
  walletAddress: string | undefined,
  tokenBalance: number,
  localEventScore: number,
  onchain: OnchainReputation,
  sybil: SybilRisk
): ReviewMode {
  if (!walletAddress || final < 55 || localEventScore <= -30 || onchain.score < 0 || sybil.level === "high") {
    return "strict";
  }
  if (tokenBalance >= store.rules.vipTokenThreshold && final >= 80 && onchain.score >= 0 && sybil.level === "low") {
    return "vip";
  }
  return "standard";
}

function calculateSybilRisk(
  discordId: string,
  guildId: string,
  walletAddress: string | undefined,
  holdings: { tokenBalance: number; nftCount: number },
  onchain: OnchainReputation,
  bindingHistory: WalletBindingHistory[]
): SybilRisk {
  const signals: string[] = [];
  let score = 0;

  if (!walletAddress) {
    signals.push("未绑定钱包，无法建立链上身份");
    score += 25;
  }

  if (walletAddress) {
    const binding = findBinding(discordId, guildId);
    if (binding && Date.now() - new Date(binding.boundAt).getTime() < 24 * 60 * 60 * 1000) {
      signals.push("钱包刚绑定，历史稳定性不足");
      score += 10;
    }
    if (holdings.tokenBalance <= 0 && holdings.nftCount <= 0) {
      signals.push("钱包没有社区通行证或项目 Token 持仓");
      score += 10;
    }
    if ((onchain.status === "success" || onchain.status === "cached") && onchain.eventCount === 0) {
      signals.push("当前钱包链上全局信誉暂无记录");
      score += 10;
    }

    const sameWalletBindings = store.bindings.filter(
      (bindingItem) =>
        bindingItem.guildId === guildId &&
        bindingItem.walletAddress.toLowerCase() === walletAddress.toLowerCase()
    );
    const uniqueDiscordIds = new Set(sameWalletBindings.map((item) => item.discordId));
    if (uniqueDiscordIds.size > 1) {
      signals.push("同一钱包在本服务器绑定了多个 Discord 身份");
      score += 30;
    }

    const uniqueWallets = new Set(bindingHistory.map((item) => item.walletAddress.toLowerCase()));
    if (uniqueWallets.size >= 2) {
      signals.push("同一 Discord 身份换绑过多个钱包");
      score += uniqueWallets.size >= 3 ? 25 : 15;
    }

    const recentSwitch = bindingHistory.some(
      (item) => item.replacedAt && Date.now() - new Date(item.replacedAt).getTime() < 7 * 24 * 60 * 60 * 1000
    );
    if (recentSwitch) {
      signals.push("近期换绑钱包，需要复核是否绕过历史记录");
      score += 10;
    }

    const historicalWallets = Array.from(uniqueWallets).filter((address) => address !== walletAddress.toLowerCase());
    const historicalNegative = store.moderation.some(
      (event) =>
        event.guildId === guildId &&
        event.scoreDelta < 0 &&
        event.walletAddress &&
        historicalWallets.includes(event.walletAddress.toLowerCase())
    );
    if (historicalNegative) {
      signals.push("历史绑定钱包存在本社区负面治理记录");
      score += 25;
    }
  }

  const level = score >= 35 ? "high" : score >= 15 ? "medium" : "low";
  return { score: Math.min(60, score), level, signals };
}

function summarizeSignals(
  eventCount: number,
  localEventScore: number,
  onchain: OnchainReputation,
  sybil: SybilRisk
): SignalSummary {
  const localBehavior =
    eventCount === 0 ? "暂无记录" : localEventScore <= -60 ? "多次违规" : localEventScore < 0 ? "有风险" : "良好";
  const globalReputation =
    onchain.status === "not_configured"
      ? "未配置"
      : onchain.status === "failed"
        ? "读取失败"
        : onchain.eventCount === 0
          ? "无记录"
          : onchain.score < 0
            ? "有负面记录"
            : "有正向记录";

  return {
    localBehavior,
    globalReputation,
    sybilRisk: sybil.level === "high" ? "高" : sybil.level === "medium" ? "中" : "低"
  };
}

function explainReview(
  walletAddress: string | undefined,
  reviewMode: ReviewMode,
  summary: SignalSummary,
  onchain: OnchainReputation,
  sybil: SybilRisk,
  localEventCount: number
) {
  const reasons: string[] = [];

  if (!walletAddress) reasons.push("该用户尚未绑定钱包，因此进入严格审查。");
  if (summary.globalReputation === "有负面记录") reasons.push("当前钱包在 Sepolia 全局信誉中有负面记录，需要重点关注。");
  if (summary.globalReputation === "无记录" && walletAddress) reasons.push("当前钱包链上暂无记录，系统会保持更谨慎的审查。");
  if (summary.globalReputation === "读取失败") {
    reasons.push(`链上信誉读取失败，当前仅使用本社区上下文。${onchain.error ? `错误：${onchain.error.slice(0, 80)}` : ""}`);
  }
  if (summary.localBehavior === "有风险" || summary.localBehavior === "多次违规") {
    reasons.push("该 Discord 身份在本社区存在负面治理历史。");
  }
  if (sybil.signals.some((signal) => signal.includes("历史绑定钱包"))) {
    reasons.push("历史绑定钱包存在本社区负面记录，当前钱包链上无记录不代表风险已消失。");
  }
  if (sybil.level !== "low") reasons.push(`身份风险信号：${sybil.signals.slice(0, 2).join("；")}。`);
  if (localEventCount === 0 && summary.globalReputation === "无记录" && walletAddress) {
    reasons.push("本社区暂无违规记录，但链上也暂无可验证历史。");
  }
  if (!reasons.length && reviewMode === "vip") {
    reasons.push("该用户持有社区资产或通行证，且本社区与链上信誉未发现明显风险。");
  }
  if (!reasons.length) reasons.push("当前没有明显风险信号，保持标准审查。");

  return reasons.slice(0, 3);
}

function buildLabels(
  walletAddress: string | undefined,
  reviewMode: ReviewMode,
  holdingSource: string,
  events: { scoreDelta: number; eventType: ModerationEventType; chainStatus?: string }[],
  onchain: OnchainReputation,
  sybil: SybilRisk
) {
  return [
    !walletAddress ? "未绑定钱包" : "已绑定钱包",
    reviewMode === "vip" ? "可信用户" : reviewMode === "strict" ? "严格审查" : "标准审查",
    holdingSource === "onchain" ? "真实链上身份/持仓" : holdingSource === "cache" ? "身份/持仓缓存" : "模拟身份/持仓",
    events.some((event) => event.chainStatus === "awaiting_wallet") ? "等待绑定补链" : undefined,
    !walletAddress && events.some((event) => event.scoreDelta < 0) ? "未绑定历史违规" : undefined,
    walletAddress && sybil.signals.some((signal) => signal.includes("刚绑定")) ? "疑似新钱包" : undefined,
    walletAddress && sybil.signals.some((signal) => signal.includes("没有社区通行证")) ? "无社区通行证" : undefined,
    onchain.status === "failed" ? "链上读取失败" : undefined,
    onchain.status !== "not_configured" && onchain.eventCount === 0 ? "链上无记录" : undefined,
    onchain.score < 0 ? "链上负信誉" : undefined,
    sybil.level !== "low" ? "需要更严格审查" : undefined,
    sybil.signals.some((signal) => signal.includes("多个 Discord")) ? "重复钱包绑定" : undefined,
    sybil.signals.some((signal) => signal.includes("换绑")) ? "换钱包风险" : undefined,
    events.filter((event) => event.scoreDelta < 0).length >= 2 ? "历史惯犯" : undefined,
    events.some((event) => event.eventType === ModerationEventType.APPEAL_ACCEPTED) ? "申诉通过" : undefined,
    events.some((event) => event.eventType === ModerationEventType.POSITIVE_CONTRIBUTION) ? "正向贡献" : undefined
  ].filter(Boolean) as string[];
}
