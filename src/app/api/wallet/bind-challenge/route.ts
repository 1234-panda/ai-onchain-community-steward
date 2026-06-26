import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { defaultGuildId } from "@/lib/config";
import { createId, createNonce, rateLimit } from "@/lib/security";
import { saveStore, store } from "@/lib/store";

export async function POST(request: Request) {
  if (!rateLimit(`bind:${request.headers.get("x-forwarded-for") ?? "local"}`, 12)) {
    return NextResponse.json({ error: "Too many binding attempts" }, { status: 429 });
  }

  const body = (await request.json()) as { guildId?: string; discordId?: string; walletAddress?: string };
  const guildId = defaultGuildId(body.guildId);

  if (!body.discordId || !body.walletAddress || !ethers.isAddress(body.walletAddress)) {
    return NextResponse.json({ error: "discordId and valid walletAddress are required" }, { status: 400 });
  }

  const nonce = createNonce();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const message = [
    "Bind this wallet to the AI Onchain Community Steward.",
    `Discord ID: ${body.discordId}`,
    `Wallet: ${ethers.getAddress(body.walletAddress)}`,
    `Nonce: ${nonce}`,
    `Expires At: ${expiresAt}`,
    "Purpose: Discord wallet binding only."
  ].join("\n");

  const challenge = {
    id: createId("chal"),
    guildId,
    discordId: body.discordId,
    walletAddress: ethers.getAddress(body.walletAddress),
    nonce,
    message,
    expiresAt
  };
  store.challenges.push(challenge);
  saveStore();

  return NextResponse.json(challenge);
}
