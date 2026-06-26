import { afterEach, describe, expect, it } from "vitest";
import { appConfig } from "../src/lib/config";
import { backfillAwaitingWalletRecords, confirmPendingEvent } from "../src/lib/moderation";
import {
  buildUserProfile,
  classifyMessage,
  createPendingEventFromMessage,
  createPositivePendingEvent
} from "../src/lib/rules";
import { removePendingEvent, saveStore, store } from "../src/lib/store";
import { ModerationEventType } from "../src/lib/types";

const testDiscordIds = new Set(["test-vip-user", "test-local-only-user", "test-awaiting-wallet-user"]);
const testGuildIds = new Set(["untrusted-guild", "trusted-test-guild"]);

function cleanupTestState() {
  store.bindings = store.bindings.filter((item) => !testDiscordIds.has(item.discordId) && !testGuildIds.has(item.guildId));
  store.bindingHistory = store.bindingHistory.filter((item) => !testDiscordIds.has(item.discordId) && !testGuildIds.has(item.guildId));
  store.pendingEvents = store.pendingEvents.filter((item) => !testDiscordIds.has(item.discordId) && !testGuildIds.has(item.guildId));
  store.moderation = store.moderation.filter((item) => !testDiscordIds.has(item.discordId) && !testGuildIds.has(item.guildId));
  delete store.holdings["0x3333333333333333333333333333333333333333"];
  appConfig.trustedGuildIds = appConfig.trustedGuildIds.filter((id) => !testGuildIds.has(id));
  saveStore();
}

describe("rules engine", () => {
  afterEach(() => {
    cleanupTestState();
  });

  it("marks spam deterministically", () => {
    const result = classifyMessage("稳赚空投来了，点击 http://fake.example 加群");
    expect(result?.eventType).toBe(ModerationEventType.SPAM);
    expect(result?.scoreDelta).toBeLessThan(0);
  });

  it("marks FUD deterministically", () => {
    const result = classifyMessage("提现困难，会不会跑路");
    expect(result?.eventType).toBe(ModerationEventType.WARNING);
    expect(result?.scoreDelta).toBeLessThan(0);
  });

  it("puts unbound users into strict review", () => {
    const profile = buildUserProfile("brand-new-user");
    expect(profile.reviewMode).toBe("strict");
    expect(profile.labels).toContain("未绑定钱包");
    expect(profile.sybilRisk.level).not.toBe("low");
  });

  it("does not let holdings override identity context blindly", () => {
    const walletAddress = "0x3333333333333333333333333333333333333333";
    store.bindings = store.bindings.filter((binding) => binding.discordId !== "test-vip-user");
    store.bindingHistory = store.bindingHistory.filter((binding) => binding.discordId !== "test-vip-user");
    store.bindings.push({
      guildId: "demo-guild",
      discordId: "test-vip-user",
      walletAddress,
      boundAt: new Date().toISOString()
    });
    store.bindingHistory.push({
      guildId: "demo-guild",
      discordId: "test-vip-user",
      walletAddress,
      boundAt: new Date().toISOString()
    });
    store.holdings[walletAddress.toLowerCase()] = {
      tokenBalance: 42,
      nftCount: 0,
      tokenSymbol: "GOV",
      source: "simulated"
    };

    const profile = buildUserProfile("test-vip-user");
    expect(profile.holdings.tokenBalance).toBeGreaterThanOrEqual(10);
    expect(profile.trustBreakdown.holdingScore).toBeGreaterThan(0);
    expect(profile.reviewExplanation.length).toBeGreaterThan(0);
    expect(profile.bindingHistory.length).toBeGreaterThan(0);
  });

  it("creates positive pending events without writing directly", () => {
    const pending = createPositivePendingEvent({
      discordId: "test-vip-user",
      eventType: ModerationEventType.POSITIVE_CONTRIBUTION
    });
    expect(pending.scoreDelta).toBe(15);
    expect(pending.eventType).toBe(ModerationEventType.POSITIVE_CONTRIBUTION);
  });

  it("keeps untrusted guild confirmations local-only", async () => {
    const pending = createPendingEventFromMessage({
      id: "test-local-only-message",
      guildId: "untrusted-guild",
      discordId: "test-local-only-user",
      authorName: "Test User",
      content: "稳赚空投来了，点击 http://fake.example 加群",
      source: "discord",
      createdAt: new Date().toISOString()
    });
    expect(pending).toBeDefined();
    if (!pending) return;

    removePendingEvent(pending.id);
    store.pendingEvents.unshift(pending);
    const record = await confirmPendingEvent(pending.id, "admin-test");

    expect(record?.chainStatus).toBe("local_only");
    expect(record?.txHash).toBeUndefined();
  });

  it("backfills trusted awaiting-wallet records after wallet binding", async () => {
    appConfig.trustedGuildIds.push("trusted-test-guild");
    const pending = createPendingEventFromMessage({
      id: "test-awaiting-wallet-message",
      guildId: "trusted-test-guild",
      discordId: "test-awaiting-wallet-user",
      authorName: "Test User",
      content: "稳赚空投来了，点击 http://fake.example 加群",
      source: "discord",
      createdAt: new Date().toISOString()
    });
    expect(pending).toBeDefined();
    if (!pending) return;

    removePendingEvent(pending.id);
    store.pendingEvents.unshift(pending);
    const record = await confirmPendingEvent(pending.id, "admin-test");
    expect(record?.chainStatus).toBe("awaiting_wallet");
    expect(record?.walletAddress).toBeUndefined();

    const walletAddress = "0x4444444444444444444444444444444444444444";
    const result = await backfillAwaitingWalletRecords("trusted-test-guild", "test-awaiting-wallet-user", walletAddress);

    expect(result.backfilledRecords).toBe(1);
    expect(result.pendingChainWrites).toBe(1);
    expect(result.records[0].walletAddress).toBe(walletAddress);
    expect(result.records[0].chainStatus).toBe("pending");
  });
});
