import { NextResponse } from "next/server";
import { appConfig } from "@/lib/config";

export async function GET() {
  if (!appConfig.discordClientId) {
    return NextResponse.json({ error: "DISCORD_CLIENT_ID is not configured" }, { status: 400 });
  }

  const permissions = "274878024768";
  const scope = encodeURIComponent("bot applications.commands");
  const url = `https://discord.com/oauth2/authorize?client_id=${appConfig.discordClientId}&permissions=${permissions}&scope=${scope}`;
  return NextResponse.json({ url });
}
