import { NextResponse } from "next/server";
import { z } from "zod";
import { defaultGuildId, isTrustedGuild } from "@/lib/config";
import { confirmPendingEvent } from "@/lib/moderation";
import { hashModerationEvent, recordOnChain } from "@/lib/reputation";
import { requireAdmin } from "@/lib/security";
import { addModerationRecord, findBinding } from "@/lib/store";
import { ModerationEventType, ModerationRecord } from "@/lib/types";

const schema = z.object({
  guildId: z.string().optional(),
  pendingEventId: z.string().optional(),
  discordId: z.string().optional(),
  eventType: z.nativeEnum(ModerationEventType).optional(),
  scoreDelta: z.number().int().optional(),
  reason: z.string().optional(),
  messageSummary: z.string().optional()
});

export async function POST(request: Request) {
  let adminId: string;
  try {
    adminId = requireAdmin(request);
  } catch {
    return NextResponse.json({ error: "Admin permission required" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.pendingEventId) {
    const confirmed = await confirmPendingEvent(parsed.data.pendingEventId, adminId);
    if (!confirmed) {
      return NextResponse.json({ error: "Pending event not found" }, { status: 404 });
    }
    return NextResponse.json(confirmed);
  }

  if (
    !parsed.data.discordId ||
    parsed.data.eventType === undefined ||
    parsed.data.scoreDelta === undefined ||
    !parsed.data.reason ||
    !parsed.data.messageSummary
  ) {
    return NextResponse.json({ error: "Either pendingEventId or full moderation payload is required" }, { status: 400 });
  }

  const guildId = defaultGuildId(parsed.data.guildId);
  const binding = findBinding(parsed.data.discordId, guildId);
  const createdAt = new Date().toISOString();
  const eventHash = hashModerationEvent({
    discordId: parsed.data.discordId,
    walletAddress: binding?.walletAddress,
    eventType: parsed.data.eventType,
    scoreDelta: parsed.data.scoreDelta,
    reason: parsed.data.reason,
    createdAt
  });
  let txHash: string | undefined;
  let chainStatus: ModerationRecord["chainStatus"] = "not_configured";
  let chainError: string | undefined;
  if (!isTrustedGuild(guildId)) {
    chainStatus = "local_only";
  } else {
    try {
      txHash = await recordOnChain({
        guildId,
        walletAddress: binding?.walletAddress,
        eventHash,
        eventType: parsed.data.eventType,
        scoreDelta: parsed.data.scoreDelta
      });
      chainStatus = txHash ? "success" : "not_configured";
    } catch (error) {
      chainStatus = "failed";
      chainError = error instanceof Error ? error.message : "Unknown chain write error";
    }
  }

  const record: ModerationRecord = {
    id: `mod_${eventHash.slice(2, 12)}`,
    guildId,
    discordId: parsed.data.discordId,
    walletAddress: binding?.walletAddress,
    eventType: parsed.data.eventType,
    scoreDelta: parsed.data.scoreDelta,
    reason: parsed.data.reason,
    messageSummary: parsed.data.messageSummary,
    eventHash,
    txHash,
    chainStatus,
    chainError,
    adminId,
    source: "discord",
    createdAt
  };
  addModerationRecord(record);

  return NextResponse.json(record);
}
