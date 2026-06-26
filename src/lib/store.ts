import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { appConfig, defaultGuildId } from "./config";
import {
  AgentSuggestion,
  AppState,
  GuildConfig,
  HoldingSnapshot,
  MemberPassIssuance,
  ModerationRecord,
  PendingEvent,
  WalletBinding,
  WalletBindingHistory,
  WalletChallenge
} from "./types";

const DEMO_DISCORD_IDS = new Set([
  "vip-1001",
  "repeat-spammer",
  "demo-user",
  "new-white-user",
  "concerned-3001"
]);

function dbPath() {
  const raw = appConfig.databaseUrl.startsWith("file:")
    ? appConfig.databaseUrl.replace("file:", "")
    : "./data/community.json";
  return resolve(process.cwd(), raw);
}

function seedState(): AppState {
  return {
    version: 1,
    guildConfigs: [],
    bindings: [],
    bindingHistory: [],
    challenges: [],
    holdings: {},
    messages: [],
    pendingEvents: [],
    moderation: [],
    suggestions: [],
    passIssuances: [],
    rules: appConfig.defaultRules
  };
}

function ensureHistoryEntry(state: AppState, binding: WalletBinding, replacedAt?: string) {
  const exists = state.bindingHistory.some(
    (item) =>
      item.guildId === binding.guildId &&
      item.discordId === binding.discordId &&
      item.walletAddress.toLowerCase() === binding.walletAddress.toLowerCase() &&
      item.boundAt === binding.boundAt
  );
  if (exists) return false;

  state.bindingHistory.push({
    guildId: binding.guildId,
    discordId: binding.discordId,
    walletAddress: binding.walletAddress,
    boundAt: binding.boundAt,
    replacedAt
  });
  return true;
}

function migrateBindingHistory(state: AppState) {
  let changed = false;
  state.bindingHistory = state.bindingHistory ?? [];
  for (const binding of state.bindings) {
    changed = ensureHistoryEntry(state, binding) || changed;
  }
  return changed;
}

function normalizeSuggestions(state: AppState) {
  const latestByKey = new Map<string, AgentSuggestion>();
  let changed = false;

  for (const suggestion of state.suggestions) {
    const key = suggestion.riskSignature
      ? `${suggestion.guildId}:${suggestion.type ?? "unknown"}:${suggestion.riskSignature}`
      : suggestion.id;
    const existing = latestByKey.get(key);
    const suggestionTime = new Date(suggestion.updatedAt ?? suggestion.createdAt).getTime();
    const existingTime = existing ? new Date(existing.updatedAt ?? existing.createdAt).getTime() : -1;
    if (!existing || suggestionTime >= existingTime) {
      latestByKey.set(key, suggestion);
    }
    if (existing) changed = true;
  }

  if (changed) {
    state.suggestions = Array.from(latestByKey.values()).sort(
      (a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime()
    );
  }
  return changed;
}

function cleanupDemoData(state: AppState) {
  let changed = false;
  const demoWallets = new Set<string>();

  for (const binding of state.bindings) {
    if (DEMO_DISCORD_IDS.has(binding.discordId)) {
      demoWallets.add(binding.walletAddress.toLowerCase());
    }
  }

  const nextBindings = state.bindings.filter((binding) => !DEMO_DISCORD_IDS.has(binding.discordId));
  if (nextBindings.length !== state.bindings.length) {
    state.bindings = nextBindings;
    changed = true;
  }

  const nextBindingHistory = state.bindingHistory.filter((binding) => !DEMO_DISCORD_IDS.has(binding.discordId));
  if (nextBindingHistory.length !== state.bindingHistory.length) {
    state.bindingHistory = nextBindingHistory;
    changed = true;
  }

  const nextChallenges = state.challenges.filter((challenge) => !DEMO_DISCORD_IDS.has(challenge.discordId));
  if (nextChallenges.length !== state.challenges.length) {
    state.challenges = nextChallenges;
    changed = true;
  }

  const nextMessages = state.messages.filter(
    (message) => message.source !== "demo" && !DEMO_DISCORD_IDS.has(message.discordId)
  );
  if (nextMessages.length !== state.messages.length) {
    state.messages = nextMessages;
    changed = true;
  }

  const nextPending = state.pendingEvents.filter(
    (event) => event.source !== "demo" && !DEMO_DISCORD_IDS.has(event.discordId)
  );
  if (nextPending.length !== state.pendingEvents.length) {
    state.pendingEvents = nextPending;
    changed = true;
  }

  const nextModeration = state.moderation.filter(
    (event) => event.source !== "demo" && !DEMO_DISCORD_IDS.has(event.discordId)
  );
  if (nextModeration.length !== state.moderation.length) {
    state.moderation = nextModeration;
    changed = true;
  }

  const nextPassIssuances = state.passIssuances.filter((item) => !DEMO_DISCORD_IDS.has(item.discordId));
  if (nextPassIssuances.length !== state.passIssuances.length) {
    state.passIssuances = nextPassIssuances;
    changed = true;
  }

  const nextSuggestions = state.suggestions.filter((item) => item.guildId !== "demo-guild");
  if (nextSuggestions.length !== state.suggestions.length) {
    state.suggestions = nextSuggestions;
    changed = true;
  }

  for (const wallet of demoWallets) {
    const stillReferenced =
      state.bindings.some((binding) => binding.walletAddress.toLowerCase() === wallet) ||
      state.passIssuances.some((item) => item.walletAddress.toLowerCase() === wallet);
    if (!stillReferenced && state.holdings[wallet]) {
      delete state.holdings[wallet];
      changed = true;
    }
  }

  return changed;
}

function downgradeLegacyChainRecords(state: AppState) {
  let changed = false;
  for (const record of state.moderation) {
    if (record.chainStatus === "success" && record.txHash && !record.txHash.startsWith("0x")) {
      record.chainStatus = "local_only";
      record.txHash = undefined;
      record.chainError = undefined;
      changed = true;
    }
  }
  return changed;
}

function normalizeGuildConfigs(state: AppState) {
  const next = new Map<string, GuildConfig>();
  for (const config of state.guildConfigs ?? []) {
    if (!config.guildId || !config.adminChannelId) continue;
    next.set(config.guildId, config);
  }
  const values = Array.from(next.values());
  const changed = values.length !== (state.guildConfigs ?? []).length;
  state.guildConfigs = values;
  return changed;
}

const globalForStore = globalThis as typeof globalThis & { __communityState?: AppState };

function writeJsonAtomically(path: string, state: AppState) {
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.tmp`;
  writeFileSync(tempPath, JSON.stringify(state, null, 2), "utf8");
  copyFileSync(tempPath, path);
  unlinkSync(tempPath);
}

function loadState(): AppState {
  if (globalForStore.__communityState) {
    return globalForStore.__communityState;
  }

  const path = dbPath();
  if (!existsSync(path)) {
    const seeded = seedState();
    writeJsonAtomically(path, seeded);
    globalForStore.__communityState = seeded;
    return seeded;
  }

  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<AppState>;
  const merged: AppState = {
    ...seedState(),
    ...parsed,
    guildConfigs: parsed.guildConfigs ?? [],
    bindings: parsed.bindings ?? [],
    bindingHistory: parsed.bindingHistory ?? [],
    challenges: parsed.challenges ?? [],
    holdings: parsed.holdings ?? {},
    messages: parsed.messages ?? [],
    pendingEvents: parsed.pendingEvents ?? [],
    moderation: parsed.moderation ?? [],
    suggestions: parsed.suggestions ?? [],
    passIssuances: parsed.passIssuances ?? [],
    rules: appConfig.defaultRules
  };

  const migrated = [
    migrateBindingHistory(merged),
    cleanupDemoData(merged),
    downgradeLegacyChainRecords(merged),
    normalizeGuildConfigs(merged),
    normalizeSuggestions(merged)
  ].some(Boolean);
  if (migrated) {
    writeJsonAtomically(path, merged);
  }

  globalForStore.__communityState = merged;
  return merged;
}

export const store = loadState();

export function saveStore() {
  const path = dbPath();
  writeJsonAtomically(path, store);
}

export function findBinding(discordId: string, guildId = defaultGuildId()) {
  return store.bindings.find((binding) => binding.discordId === discordId && binding.guildId === guildId);
}

export function getBindingHistory(discordId: string, guildId = defaultGuildId()): WalletBindingHistory[] {
  return store.bindingHistory
    .filter((binding) => binding.discordId === discordId && binding.guildId === guildId)
    .sort((a, b) => new Date(b.boundAt).getTime() - new Date(a.boundAt).getTime());
}

export function upsertBinding(binding: WalletBinding) {
  const previous = findBinding(binding.discordId, binding.guildId);
  const now = binding.boundAt;

  if (previous && previous.walletAddress.toLowerCase() !== binding.walletAddress.toLowerCase()) {
    const previousHistory = store.bindingHistory.find(
      (item) =>
        item.guildId === previous.guildId &&
        item.discordId === previous.discordId &&
        item.walletAddress.toLowerCase() === previous.walletAddress.toLowerCase() &&
        item.boundAt === previous.boundAt
    );
    if (previousHistory && !previousHistory.replacedAt) {
      previousHistory.replacedAt = now;
    }
  }

  store.bindings = store.bindings.filter(
    (item) => item.discordId !== binding.discordId || item.guildId !== binding.guildId
  );
  store.bindings.push(binding);
  ensureHistoryEntry(store, binding);
  saveStore();
}

export function getHoldings(walletAddress?: string): HoldingSnapshot {
  if (!walletAddress) {
    return { tokenBalance: 0, nftCount: 0, tokenSymbol: "GOV", source: "simulated" };
  }

  return (
    store.holdings[walletAddress.toLowerCase()] ??
    store.holdings[walletAddress] ?? {
      tokenBalance: 0,
      nftCount: 0,
      tokenSymbol: "GOV",
      source: appConfig.vipTokenAddress || appConfig.vipNftAddress ? "cache" : "simulated"
    }
  );
}

export function upsertHoldings(walletAddress: string, holdings: HoldingSnapshot) {
  store.holdings[walletAddress.toLowerCase()] = holdings;
  saveStore();
}

export function addMemberPassIssuance(issuance: MemberPassIssuance) {
  store.passIssuances.unshift(issuance);
  saveStore();
}

export function addPendingEvent(event: PendingEvent) {
  const exists = store.pendingEvents.some((item) => item.id === event.id);
  if (!exists) {
    store.pendingEvents.unshift(event);
    saveStore();
  }
}

export function removePendingEvent(id: string) {
  const event = store.pendingEvents.find((item) => item.id === id);
  store.pendingEvents = store.pendingEvents.filter((item) => item.id !== id);
  saveStore();
  return event;
}

export function addModerationRecord(record: ModerationRecord) {
  store.moderation.unshift(record);
  saveStore();
}

export function upsertSuggestion(suggestion: AgentSuggestion) {
  const index = store.suggestions.findIndex((item) => item.id === suggestion.id);
  if (index >= 0) {
    store.suggestions[index] = {
      ...store.suggestions[index],
      ...suggestion,
      createdAt: store.suggestions[index].createdAt,
      updatedAt: suggestion.updatedAt ?? new Date().toISOString()
    };
  } else {
    store.suggestions.unshift(suggestion);
  }
  normalizeSuggestions(store);
  saveStore();
}

export function findGuildConfig(guildId = defaultGuildId()) {
  return store.guildConfigs.find((config) => config.guildId === guildId);
}

export function upsertGuildConfig(config: GuildConfig) {
  store.guildConfigs = store.guildConfigs.filter((item) => item.guildId !== config.guildId);
  store.guildConfigs.push(config);
  saveStore();
}

export function resetDemoData() {
  const changed = cleanupDemoData(store);
  if (changed) {
    saveStore();
  }
}
