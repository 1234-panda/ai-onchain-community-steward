import { NextResponse } from "next/server";
import { analyzeCommunity } from "@/lib/agent";
import { defaultGuildId } from "@/lib/config";
import { createPendingEventFromMessage, createPositivePendingEvent } from "@/lib/rules";
import { createId, rateLimit } from "@/lib/security";
import { addPendingEvent, findBinding, saveStore, store } from "@/lib/store";
import { CommunityMessage, DemoOutcome, ModerationEventType } from "@/lib/types";

export async function POST(request: Request) {
  if (!rateLimit("demo-message", 40)) {
    return NextResponse.json({ error: "Too many demo messages" }, { status: 429 });
  }

  const body = (await request.json()) as {
    guildId?: string;
    discordId?: string;
    authorName?: string;
    content?: string;
    scenario?: "spam" | "vip" | "fud" | "repeat" | "contribution";
  };
  const guildId = defaultGuildId(body.guildId);
  const scenario = scenarioMessage(body.scenario);
  const discordId = body.discordId ?? scenario.discordId;

  if (body.scenario === "contribution") {
    const pending = createPositivePendingEvent({
      guildId,
      discordId,
      eventType: ModerationEventType.POSITIVE_CONTRIBUTION,
      reason: "积极贡献，增加社区信誉",
      messageSummary: body.content ?? scenario.content,
      source: "demo"
    });
    addPendingEvent(pending);
    return NextResponse.json({
      pending,
      suggestions: [],
      outcome: "positive_created" satisfies DemoOutcome,
      feedback: "已创建正向待确认事件，管理员确认后才会写链。"
    });
  }

  const message: CommunityMessage = {
    id: createId("msg"),
    guildId,
    discordId,
    authorName: body.authorName ?? scenario.authorName,
    content: body.content ?? scenario.content,
    source: "demo",
    createdAt: new Date().toISOString(),
    walletAddress: findBinding(discordId, guildId)?.walletAddress
  };

  store.messages.push(message);
  saveStore();
  const pending = createPendingEventFromMessage(message);
  if (pending) {
    addPendingEvent(pending);
  }

  const suggestions = await analyzeCommunity(store.messages, guildId);
  const outcome: DemoOutcome = pending
    ? "pending_created"
    : suggestions.length
      ? "suggestion_created"
      : "message_only";
  const feedback =
    outcome === "pending_created"
      ? "已创建风险待确认事件。"
      : outcome === "suggestion_created"
        ? "已生成 AI 建议。"
        : "已记录消息，未触发风险事件。";

  return NextResponse.json({ message, pending, suggestions, outcome, feedback });
}

function scenarioMessage(scenario = "spam") {
  const samples = {
    spam: {
      discordId: "new-white-user",
      authorName: "New Wallet",
      content: "稳赚空投来了，点击 http://fake-airdrop.example 立刻领取，进群私聊。"
    },
    vip: {
      discordId: "vip-1001",
      authorName: "VIP Holder",
      content: "我持有 42 个 GOV，想了解本周治理投票的风险点。"
    },
    fud: {
      discordId: "concerned-3001",
      authorName: "Concerned Member",
      content: "最近是不是不能提现？我看到好几个人说提现困难，会不会跑路？"
    },
    repeat: {
      discordId: "repeat-spammer",
      authorName: "Repeat Spammer",
      content: "加群领空投，稳赚不亏，私聊我拿白名单。"
    },
    contribution: {
      discordId: "vip-1001",
      authorName: "Helpful Member",
      content: "该成员整理了防诈骗教程并帮助新成员完成钱包安全检查。"
    }
  } as const;

  return samples[scenario as keyof typeof samples] ?? samples.spam;
}
