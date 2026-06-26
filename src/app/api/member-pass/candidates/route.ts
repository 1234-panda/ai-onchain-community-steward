import { NextResponse } from "next/server";
import { defaultGuildId } from "@/lib/config";
import { listMemberPassCandidates } from "@/lib/member-pass";
import { requireAdmin } from "@/lib/security";

export function GET(request: Request) {
  try {
    requireAdmin(request);
  } catch {
    return NextResponse.json({ error: "Admin permission required" }, { status: 403 });
  }

  const guildId = defaultGuildId(new URL(request.url).searchParams.get("guildId") ?? undefined);
  return NextResponse.json(listMemberPassCandidates(guildId));
}
