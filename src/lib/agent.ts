import { createHash } from "crypto";
import { appConfig, defaultGuildId } from "./config";
import { buildUserProfileAsync } from "./rules";
import { upsertSuggestion } from "./store";
import { AgentSuggestion, CommunityMessage } from "./types";

const riskPattern = /(提现困难|不能提现|跑路|rug|崩盘|资金盘)/i;

function stableSuggestionId(guildId: string, type: string, riskSignature: string) {
  const hash = createHash("sha256").update(`${guildId}:${type}:${riskSignature}`).digest("hex").slice(0, 16);
  return `sug_${hash}`;
}

export async function analyzeCommunity(messages: CommunityMessage[], guildId = defaultGuildId()): Promise<AgentSuggestion[]> {
  const recent = messages.filter((message) => message.guildId === guildId).slice(-30);
  const risky = recent.filter((message) => riskPattern.test(message.content));
  const sybilSuggestion = await detectSybilCluster(recent, guildId);
  if (sybilSuggestion) {
    upsertSuggestion(sybilSuggestion);
    return [sybilSuggestion];
  }

  if (appConfig.llm.apiKey && recent.length > 0 && risky.length >= 2) {
    const suggestion = await callLlmForSuggestion(guildId, recent, risky.length);
    upsertSuggestion(suggestion);
    return [suggestion];
  }

  if (risky.length >= 2) {
    const riskBucket = risky.length >= 4 ? "many" : "some";
    const riskSignature = `fud:${riskBucket}`;
    const now = new Date().toISOString();
    const suggestion: AgentSuggestion = {
      id: stableSuggestionId(guildId, "fud", riskSignature),
      guildId,
      type: "fud",
      riskSignature,
      title: "提现/FUD 讨论升温",
      severity: risky.length >= 4 ? "high" : "medium",
      summary: `最近 ${recent.length} 条消息中有 ${risky.length} 条涉及提现困难、跑路或崩盘等风险词。`,
      recommendation: "建议管理员发布透明说明，解释提现状态、处理 ETA 和官方支持入口。",
      isAdviceOnly: true,
      createdAt: now,
      updatedAt: now
    };
    upsertSuggestion(suggestion);
    return [suggestion];
  }

  return [];
}

async function detectSybilCluster(messages: CommunityMessage[], guildId: string): Promise<AgentSuggestion | undefined> {
  const userIds = Array.from(new Set(messages.map((message) => message.discordId)));
  if (userIds.length < 4) return undefined;

  const profiles = await Promise.all(userIds.map((id) => buildUserProfileAsync(id, guildId)));
  const mediumOrHigh = profiles.filter((profile) => profile.sybilRisk.level !== "low");
  const noOnchainHistory = profiles.filter(
    (profile) => profile.walletAddress && profile.onchainReputation.eventCount === 0
  );

  if (mediumOrHigh.length >= 4 || noOnchainHistory.length >= 4) {
    const riskSignature = `sybil:${mediumOrHigh.length >= 4 ? "identity" : "onchain-empty"}`;
    const now = new Date().toISOString();
    return {
      id: stableSuggestionId(guildId, "sybil_cluster", riskSignature),
      guildId,
      type: "sybil_cluster",
      riskSignature,
      title: "疑似批量小号/女巫集群",
      severity: "high",
      summary: `最近消息中出现 ${mediumOrHigh.length} 个中高身份风险用户，${noOnchainHistory.length} 个钱包链上无信誉历史。`,
      recommendation: "建议管理员临时提高新用户审查强度，并要求关键操作前完成钱包绑定和人工确认。",
      isAdviceOnly: true,
      createdAt: now,
      updatedAt: now
    };
  }

  return undefined;
}

async function callLlmForSuggestion(
  guildId: string,
  messages: CommunityMessage[],
  riskyCount: number
): Promise<AgentSuggestion> {
  const riskSignature = `llm:fud:${riskyCount >= 4 ? "many" : "some"}`;
  const now = new Date().toISOString();
  const response = await fetch(`${appConfig.llm.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${appConfig.llm.apiKey}`
    },
    body: JSON.stringify({
      model: appConfig.llm.model,
      messages: [
        {
          role: "system",
          content:
            "你是 Web3 社区 AI 参谋，只能输出建议，不能决定封禁、扣分或链上写入。用中文简洁总结风险。"
        },
        {
          role: "user",
          content: JSON.stringify({ riskyCount, messages: messages.map((m) => m.content) })
        }
      ]
    })
  });

  if (!response.ok) {
    return {
      id: stableSuggestionId(guildId, "llm_fallback", riskSignature),
      guildId,
      type: "llm_fallback",
      riskSignature,
      title: "AI 建议生成失败，已降级",
      severity: "low",
      summary: "LLM 接口暂不可用，系统保留规则检测结果。",
      recommendation: "检查 LLM_API_KEY、LLM_BASE_URL 和网络配置。",
      isAdviceOnly: true,
      createdAt: now,
      updatedAt: now
    };
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content ?? "AI 未返回明确建议。";

  return {
    id: stableSuggestionId(guildId, "llm", riskSignature),
    guildId,
    type: "llm",
    riskSignature,
    title: "AI 社区风险建议",
    severity: riskyCount >= 4 ? "high" : riskyCount >= 2 ? "medium" : "low",
    summary: text,
    recommendation: "请管理员结合链上身份、历史信誉和上下文人工确认。",
    isAdviceOnly: true,
    createdAt: now,
    updatedAt: now
  };
}
