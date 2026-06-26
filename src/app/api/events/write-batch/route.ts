import { NextResponse } from "next/server";
import { defaultGuildId, isTrustedGuild } from "@/lib/config";
import { recordBatchOnChain } from "@/lib/reputation";
import { requireAdmin } from "@/lib/security";
import { saveStore, store } from "@/lib/store";

export async function POST(request: Request) {
  try {
    requireAdmin(request);
  } catch {
    return NextResponse.json({ error: "Admin permission required" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { guildId?: string; limit?: number };
  const guildId = defaultGuildId(body.guildId);
  const limit = Math.max(1, Math.min(Number(body.limit ?? 10), 25));

  if (!isTrustedGuild(guildId)) {
    return NextResponse.json({ error: "This guild is not trusted for global Sepolia writes" }, { status: 403 });
  }

  const records = store.moderation
    .filter(
      (record) =>
        record.guildId === guildId &&
        Boolean(record.walletAddress) &&
        (record.chainStatus === "pending" || record.chainStatus === "failed")
    )
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(0, limit);

  if (!records.length) {
    return NextResponse.json({ error: "No pending or failed records with wallets are ready for batch write" }, { status: 400 });
  }

  try {
    const txHash = await recordBatchOnChain({
      guildId,
      records: records.map((record) => ({
        walletAddress: record.walletAddress!,
        eventHash: record.eventHash,
        eventType: record.eventType,
        scoreDelta: record.scoreDelta
      }))
    });

    if (!txHash) {
      return NextResponse.json({ error: "Batch chain write is not configured" }, { status: 400 });
    }

    for (const record of records) {
      record.txHash = txHash;
      record.chainStatus = "success";
      record.chainError = undefined;
    }
    saveStore();

    return NextResponse.json({
      txHash,
      count: records.length,
      recordIds: records.map((record) => record.id)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown batch chain write error";
    for (const record of records) {
      record.chainError = message;
    }
    saveStore();

    const unsupported =
      message.includes("batchRecordEvents") ||
      message.includes("function selector") ||
      message.includes("missing revert data");

    return NextResponse.json(
      {
        error: unsupported
          ? "Current reputation contract does not support batchRecordEvents. Please redeploy CommunityReputation and update REPUTATION_CONTRACT_ADDRESS."
          : message
      },
      { status: unsupported ? 400 : 502 }
    );
  }
}
