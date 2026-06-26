import { NextResponse } from "next/server";
import { isTrustedGuild } from "@/lib/config";
import { recordOnChain } from "@/lib/reputation";
import { requireAdmin } from "@/lib/security";
import { saveStore, store } from "@/lib/store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireAdmin(request);
  } catch {
    return NextResponse.json({ error: "Admin permission required" }, { status: 403 });
  }

  const { id } = await context.params;
  const record = store.moderation.find((event) => event.id === id);
  if (!record) {
    return NextResponse.json({ error: "Moderation record not found" }, { status: 404 });
  }
  if (record.chainStatus === "local_only") {
    return NextResponse.json({ error: "Local-only history cannot be retried on-chain" }, { status: 400 });
  }
  if (record.chainStatus === "awaiting_wallet") {
    return NextResponse.json({ error: "This record is waiting for wallet binding before it can be written on-chain" }, { status: 400 });
  }
  if (!isTrustedGuild(record.guildId)) {
    return NextResponse.json({ error: "This guild is not trusted for global Sepolia writes" }, { status: 403 });
  }
  if (record.chainStatus !== "pending" && record.chainStatus !== "failed") {
    return NextResponse.json({ error: "Only pending or failed records can be written on-chain" }, { status: 400 });
  }

  try {
    const txHash = await recordOnChain(record);
    record.txHash = txHash;
    record.chainStatus = txHash ? "success" : "not_configured";
    record.chainError = undefined;
    saveStore();
    return NextResponse.json(record);
  } catch (error) {
    record.chainStatus = "failed";
    record.chainError = error instanceof Error ? error.message : "Unknown chain write error";
    saveStore();
    return NextResponse.json(record, { status: 502 });
  }
}
