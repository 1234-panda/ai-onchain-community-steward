import { NextResponse } from "next/server";
import { chainConfig } from "@/lib/config";
import { analyzeCommunity } from "@/lib/agent";
import { defaultGuildId } from "@/lib/config";
import { buildUserProfileAsync } from "@/lib/rules";
import { store } from "@/lib/store";

export async function GET(request: Request) {
  const guildId = defaultGuildId(new URL(request.url).searchParams.get("guildId") ?? undefined);
  await analyzeCommunity(store.messages, guildId);
  const scopedMessages = store.messages.filter((message) => message.guildId === guildId);
  const scopedModeration = store.moderation.filter((event) => event.guildId === guildId);
  const scopedPending = store.pendingEvents.filter((event) => event.guildId === guildId);
  const scopedBindings = store.bindings.filter((binding) => binding.guildId === guildId);
  const riskIds = Array.from(
    new Set(
      scopedMessages
        .map((message) => message.discordId)
        .concat(scopedModeration.map((event) => event.discordId))
        .concat(scopedBindings.map((binding) => binding.discordId))
    )
  );
  const profiles = await Promise.all(riskIds.map((id) => buildUserProfileAsync(id, guildId)));
  const activeRiskUsers = profiles
    .filter((profile) => profile.reviewMode === "strict" || profile.trustScore < 60)
    .slice(0, 6);
  const negativeEvents = scopedModeration.filter((event) => event.scoreDelta < 0).length + scopedPending.length;
  const healthScore = Math.max(20, 90 - negativeEvents * 6 - activeRiskUsers.length * 4);

  return NextResponse.json({
    guildId,
    healthScore,
    sentiment: healthScore < 55 ? "stressed" : healthScore < 75 ? "neutral" : "positive",
    activeRiskUsers,
    pendingEvents: scopedPending.slice(0, 10),
    recentEvents: scopedModeration.slice(0, 8),
    suggestions: store.suggestions.filter((item) => item.guildId === guildId).slice(0, 5),
    chain: chainConfig,
    stats: {
      bindings: scopedBindings.length,
      messages: scopedMessages.length,
      pending: scopedPending.length,
      confirmed: scopedModeration.length,
      demoMessages: scopedMessages.filter((message) => message.source === "demo").length,
      discordMessages: scopedMessages.filter((message) => message.source === "discord").length
    }
  });
}
