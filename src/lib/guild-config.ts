import { appConfig, defaultGuildId } from "./config";
import { findGuildConfig } from "./store";

export function resolveAdminChannelId(guildId?: string) {
  const scopedGuildId = defaultGuildId(guildId);
  return findGuildConfig(scopedGuildId)?.adminChannelId ?? appConfig.discordAdminChannelId;
}

export function isGuildDemoEnabled(guildId?: string) {
  const scopedGuildId = defaultGuildId(guildId);
  const config = findGuildConfig(scopedGuildId);
  return config ? config.demoMode : appConfig.demoMode;
}
