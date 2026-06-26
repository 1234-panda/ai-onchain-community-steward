import { NextResponse } from "next/server";
import { analyzeCommunity } from "@/lib/agent";
import { defaultGuildId } from "@/lib/config";
import { createPendingEventFromMessage } from "@/lib/rules";
import { createId } from "@/lib/security";
import { addPendingEvent, findBinding, saveStore, store } from "@/lib/store";
import { CommunityMessage } from "@/lib/types";

export async function POST(request: Request) {
  const botSecret = request.headers.get("x-bot-secret");
  if (process.env.DISCORD_BOT_TOKEN && botSecret !== process.env.DISCORD_BOT_TOKEN.slice(-16)) {
    return NextResponse.json({ error: "Bot permission required" }, { status: 403 });
  }

  const body = (await request.json()) as {
    guildId?: string;
    discordId?: string;
    authorName?: string;
    content?: string;
  };

  if (!body.discordId || !body.content) {
    return NextResponse.json({ error: "discordId and content are required" }, { status: 400 });
  }

  const guildId = defaultGuildId(body.guildId);
  const message: CommunityMessage = {
    id: createId("msg"),
    guildId,
    discordId: body.discordId,
    authorName: body.authorName ?? body.discordId,
    content: body.content,
    source: "discord",
    createdAt: new Date().toISOString(),
    walletAddress: findBinding(body.discordId, guildId)?.walletAddress
  };

  store.messages.push(message);
  saveStore();
  const pending = createPendingEventFromMessage(message);
  if (pending) {
    addPendingEvent(pending);
  }
  const suggestions = await analyzeCommunity(store.messages, guildId);

  return NextResponse.json({ message, pending, suggestions });
}
