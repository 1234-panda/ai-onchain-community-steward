import { NextResponse } from "next/server";
import { z } from "zod";
import { addPendingEvent } from "@/lib/store";
import { createPositivePendingEvent } from "@/lib/rules";
import { requireAdmin } from "@/lib/security";
import { ModerationEventType } from "@/lib/types";

const schema = z.object({
  guildId: z.string().optional(),
  discordId: z.string(),
  eventType: z.union([
    z.literal(ModerationEventType.APPEAL_ACCEPTED),
    z.literal(ModerationEventType.POSITIVE_CONTRIBUTION)
  ]),
  reason: z.string().optional(),
  messageSummary: z.string().optional()
});

export async function POST(request: Request) {
  try {
    requireAdmin(request);
  } catch {
    return NextResponse.json({ error: "Admin permission required" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const pending = createPositivePendingEvent({
    ...parsed.data,
    source: "discord"
  });
  addPendingEvent(pending);
  return NextResponse.json({ pending });
}
