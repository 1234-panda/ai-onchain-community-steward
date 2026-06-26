import { NextResponse } from "next/server";
import { defaultGuildId } from "@/lib/config";
import { buildUserProfileAsync } from "@/lib/rules";

export async function GET(request: Request, context: { params: Promise<{ discordId: string }> }) {
  const { discordId } = await context.params;
  const guildId = defaultGuildId(new URL(request.url).searchParams.get("guildId") ?? undefined);
  return NextResponse.json(await buildUserProfileAsync(discordId, guildId));
}
