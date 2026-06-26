import { NextResponse } from "next/server";
import { defaultGuildId } from "@/lib/config";
import { store } from "@/lib/store";

export async function GET(request: Request) {
  const guildId = defaultGuildId(new URL(request.url).searchParams.get("guildId") ?? undefined);
  return NextResponse.json(store.pendingEvents.filter((event) => event.guildId === guildId));
}
