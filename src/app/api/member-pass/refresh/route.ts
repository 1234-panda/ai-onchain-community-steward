import { NextResponse } from "next/server";
import { refreshMemberPassForUser } from "@/lib/member-pass";
import { requireAdmin } from "@/lib/security";

export async function POST(request: Request) {
  try {
    requireAdmin(request);
  } catch {
    return NextResponse.json({ error: "Admin permission required" }, { status: 403 });
  }

  const body = (await request.json()) as { guildId?: string; discordId?: string };
  if (!body.discordId) {
    return NextResponse.json({ error: "discordId is required" }, { status: 400 });
  }

  try {
    return NextResponse.json(await refreshMemberPassForUser({ guildId: body.guildId, discordId: body.discordId }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to refresh member pass" },
      { status: 400 }
    );
  }
}
