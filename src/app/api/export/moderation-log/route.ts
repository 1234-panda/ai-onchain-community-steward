import { NextResponse } from "next/server";
import { defaultGuildId } from "@/lib/config";
import { store } from "@/lib/store";

export async function GET(request: Request) {
  const guildId = defaultGuildId(new URL(request.url).searchParams.get("guildId") ?? undefined);
  return NextResponse.json({
    guildId,
    exportedAt: new Date().toISOString(),
    records: store.moderation.filter((event) => event.guildId === guildId)
  });
}
