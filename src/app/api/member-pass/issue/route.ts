import { NextResponse } from "next/server";
import { issueMemberPass } from "@/lib/member-pass";
import { requireAdmin } from "@/lib/security";

export async function POST(request: Request) {
  let adminId: string;
  try {
    adminId = requireAdmin(request);
  } catch {
    return NextResponse.json({ error: "Admin permission required" }, { status: 403 });
  }

  const body = (await request.json()) as { guildId?: string; discordId?: string };
  if (!body.discordId) {
    return NextResponse.json({ error: "discordId is required" }, { status: 400 });
  }

  try {
    const result = await issueMemberPass({
      guildId: body.guildId,
      discordId: body.discordId,
      adminId
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to issue member pass" },
      { status: 400 }
    );
  }
}
