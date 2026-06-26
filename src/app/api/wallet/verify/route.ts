import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { isExpired } from "@/lib/security";
import { fetchHoldingSnapshot } from "@/lib/chain";
import { backfillAwaitingWalletRecords } from "@/lib/moderation";
import { store, upsertBinding, upsertHoldings, saveStore } from "@/lib/store";

export async function POST(request: Request) {
  const body = (await request.json()) as { challengeId?: string; signature?: string };
  const challenge = store.challenges.find((item) => item.id === body.challengeId);

  if (!challenge || !body.signature) {
    return NextResponse.json({ error: "challengeId and signature are required" }, { status: 400 });
  }

  if (challenge.usedAt) {
    return NextResponse.json({ error: "Challenge already used" }, { status: 409 });
  }

  if (isExpired(challenge.expiresAt)) {
    return NextResponse.json({ error: "Challenge expired" }, { status: 410 });
  }

  const recovered = ethers.verifyMessage(challenge.message, body.signature);

  if (ethers.getAddress(recovered) !== ethers.getAddress(challenge.walletAddress)) {
    return NextResponse.json({ error: "Signature does not match wallet" }, { status: 401 });
  }

  challenge.usedAt = new Date().toISOString();
  saveStore();
  const walletAddress = ethers.getAddress(challenge.walletAddress);
  upsertBinding({
    guildId: challenge.guildId,
    discordId: challenge.discordId,
    walletAddress,
    boundAt: new Date().toISOString()
  });

  const holdings = await fetchHoldingSnapshot(walletAddress).catch(() => undefined);
  if (holdings) {
    upsertHoldings(walletAddress, holdings);
  }

  const backfill = await backfillAwaitingWalletRecords(challenge.guildId, challenge.discordId, walletAddress);

  return NextResponse.json({
    ok: true,
    guildId: challenge.guildId,
    discordId: challenge.discordId,
    walletAddress,
    backfilledRecords: backfill.backfilledRecords,
    chainWrites: backfill.chainWrites,
    pendingChainWrites: backfill.pendingChainWrites
  });
}
