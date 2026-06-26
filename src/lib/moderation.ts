import { appConfig, isTrustedGuild } from "./config";
import { hashModerationEvent, recordOnChain } from "./reputation";
import { addModerationRecord, removePendingEvent, saveStore, store } from "./store";
import { BackfillResult, ModerationRecord } from "./types";

export async function confirmPendingEvent(
  id: string,
  adminId: string,
  overrides?: { reason?: string; scoreDelta?: number }
) {
  const pending = removePendingEvent(id);
  if (!pending) {
    return undefined;
  }
  if (typeof overrides?.reason === "string" && overrides.reason.trim()) {
    pending.reason = overrides.reason.trim();
  }
  if (typeof overrides?.scoreDelta === "number" && Number.isFinite(overrides.scoreDelta)) {
    pending.scoreDelta = overrides.scoreDelta;
  }

  const createdAt = new Date().toISOString();
  const eventHash = hashModerationEvent({
    discordId: pending.discordId,
    walletAddress: pending.walletAddress,
    eventType: pending.eventType,
    scoreDelta: pending.scoreDelta,
    reason: pending.reason,
    createdAt
  });
  let txHash: string | undefined;
  let chainStatus: ModerationRecord["chainStatus"] = "not_configured";
  let chainError: string | undefined;

  if (!isTrustedGuild(pending.guildId)) {
    chainStatus = "local_only";
  } else if (!pending.walletAddress) {
    chainStatus = "awaiting_wallet";
  } else if (appConfig.chainWriteMode === "manual") {
    chainStatus = "pending";
  } else if (appConfig.chainWriteMode === "off") {
    chainStatus = "not_configured";
  } else {
    try {
      txHash = await recordOnChain({
        guildId: pending.guildId,
        walletAddress: pending.walletAddress,
        eventHash,
        eventType: pending.eventType,
        scoreDelta: pending.scoreDelta
      });
      chainStatus = txHash ? "success" : "not_configured";
    } catch (error) {
      chainStatus = "failed";
      chainError = error instanceof Error ? error.message : "Unknown chain write error";
    }
  }

  const record: ModerationRecord = {
    id: `mod_${eventHash.slice(2, 12)}`,
    guildId: pending.guildId,
    discordId: pending.discordId,
    walletAddress: pending.walletAddress,
    eventType: pending.eventType,
    scoreDelta: pending.scoreDelta,
    reason: pending.reason,
    messageSummary: pending.messageSummary,
    eventHash,
    txHash,
    chainStatus,
    chainError,
    adminId,
    source: pending.source,
    createdAt
  };
  addModerationRecord(record);
  return record;
}

export async function backfillAwaitingWalletRecords(
  guildId: string,
  discordId: string,
  walletAddress: string
): Promise<BackfillResult> {
  const records = store.moderation.filter(
    (record) =>
      record.guildId === guildId &&
      record.discordId === discordId &&
      record.chainStatus === "awaiting_wallet"
  );

  const result: BackfillResult = {
    backfilledRecords: 0,
    chainWrites: 0,
    pendingChainWrites: 0,
    records: []
  };

  for (const record of records) {
    record.walletAddress = walletAddress;
    result.backfilledRecords += 1;

    if (!isTrustedGuild(guildId)) {
      record.chainStatus = "local_only";
    } else if (appConfig.chainWriteMode === "manual") {
      record.chainStatus = "pending";
      result.pendingChainWrites += 1;
    } else if (appConfig.chainWriteMode === "off") {
      record.chainStatus = "not_configured";
    } else {
      try {
        const txHash = await recordOnChain({
          guildId,
          walletAddress,
          eventHash: record.eventHash,
          eventType: record.eventType,
          scoreDelta: record.scoreDelta
        });
        record.txHash = txHash;
        record.chainStatus = txHash ? "success" : "not_configured";
        record.chainError = undefined;
        if (txHash) result.chainWrites += 1;
      } catch (error) {
        record.chainStatus = "failed";
        record.chainError = error instanceof Error ? error.message : "Unknown chain write error";
      }
    }

    result.records.push({ ...record });
  }

  if (result.backfilledRecords > 0) {
    saveStore();
  }

  return result;
}
