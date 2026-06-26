import { NextResponse } from "next/server";
import { defaultGuildId } from "@/lib/config";
import { createPositivePendingEvent } from "@/lib/rules";
import { rateLimit } from "@/lib/security";
import { addPendingEvent } from "@/lib/store";
import { ModerationEventType } from "@/lib/types";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    guildId?: string;
    discordId?: string;
    reason?: string;
  };

  if (!body.discordId || !body.reason?.trim()) {
    return NextResponse.json({ error: "discordId and reason are required" }, { status: 400 });
  }

  const guildId = defaultGuildId(body.guildId);
  if (!rateLimit(`appeal:${guildId}:${body.discordId}`, 1, 10 * 60_000)) {
    return NextResponse.json({ error: "申诉已提交，请等待管理员复核" }, { status: 429 });
  }

  const pending = createPositivePendingEvent({
    guildId,
    discordId: body.discordId,
    eventType: ModerationEventType.APPEAL_ACCEPTED,
    reason: "User appeal pending review",
    messageSummary: `Appeal request: ${body.reason.trim().slice(0, 160)}`,
    source: "discord"
  });
  addPendingEvent(pending);
  return NextResponse.json({ pending });
}
