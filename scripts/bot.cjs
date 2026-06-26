require("./load-env.cjs").loadEnv();
const {
  ActionRowBuilder,
  ActivityType,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  GatewayIntentBits,
  MessageFlags,
  ModalBuilder,
  Partials,
  PermissionsBitField,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const token = process.env.DISCORD_BOT_TOKEN;
const trustedGuildIds = (process.env.TRUSTED_GUILD_IDS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const publicSuggestionBuckets = new Map();
const pendingDefaults = new Map();

if (!token) {
  throw new Error("DISCORD_BOT_TOKEN is required.");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
});

function bindUrl(interactionOrMessage) {
  const guildId = interactionOrMessage.guildId || "demo-guild";
  const userId = interactionOrMessage.user?.id || interactionOrMessage.author?.id;
  return `${appUrl}/bind?discordId=${encodeURIComponent(userId)}&guildId=${encodeURIComponent(guildId)}`;
}

function ephemeral() {
  return { flags: MessageFlags.Ephemeral };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForApiReady(maxMs = 60_000, intervalMs = 2_000) {
  const statusUrl = `${appUrl.replace(/\/$/, "")}/api/setup/status`;
  const startedAt = Date.now();

  while (Date.now() - startedAt < maxMs) {
    try {
      const response = await fetch(statusUrl, { headers: apiHeaders() });
      if (response.ok) {
        console.log(`API is ready: ${statusUrl}`);
        return;
      }
      console.log(`Waiting for API: ${statusUrl} returned ${response.status}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`Waiting for API: ${message}`);
    }
    await sleep(intervalMs);
  }

  throw new Error(`API did not become ready within ${Math.round(maxMs / 1000)}s: ${statusUrl}`);
}

function apiHeaders(extra = {}) {
  return {
    "content-type": "application/json",
    "x-bot-secret": token.slice(-16),
    ...extra
  };
}

async function api(path, options = {}) {
  const response = await fetch(`${appUrl}${path}`, {
    ...options,
    headers: apiHeaders(options.headers || {})
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload };
}

function adminHeaders(adminId) {
  return {
    "x-demo-role": "admin",
    "x-admin-id": adminId,
    "x-admin-password": process.env.ADMIN_DASHBOARD_PASSWORD || ""
  };
}

function canManage(interaction) {
  return interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);
}

function isTrustedGuild(guildId) {
  return Boolean(guildId && trustedGuildIds.includes(guildId));
}

function defaultReasonForEventType(eventType) {
  const type = Number(eventType);
  if (type === 1) return "疑似广告、拉群或诱导链接";
  if (type === 2) return "疑似诈骗或危险授权话术";
  if (type === 5) return "申诉通过，恢复部分信誉";
  if (type === 6) return "积极贡献，增加社区信誉";
  return "涉及提现/FUD 讨论，需要管理员关注";
}

function scoreRangeForEventType(eventType) {
  const type = Number(eventType);
  if (type === 1) return { min: -50, max: -10, label: "Spam", default: -30 };
  if (type === 2) return { min: -100, max: -30, label: "Scam", default: -50 };
  if (type === 5) return { min: 5, max: 30, label: "Appeal Accepted", default: 20 };
  if (type === 6) return { min: 5, max: 20, label: "Positive Contribution", default: 15 };
  return { min: -20, max: 0, label: "Warning/FUD", default: -5 };
}

function defaultScoreForEventType(eventType) {
  return scoreRangeForEventType(eventType).default;
}

function validateScoreInRange(eventType, scoreDelta) {
  const range = scoreRangeForEventType(eventType);
  if (scoreDelta < range.min || scoreDelta > range.max) {
    return `${range.label} score must be between ${range.min} and ${range.max}.`;
  }
  return null;
}

function rememberPendingDefaults(pending) {
  if (!pending?.id) return;
  pendingDefaults.set(pending.id, {
    reason: pending.reason || defaultReasonForEventType(pending.eventType),
    scoreDelta: Number.isFinite(Number(pending.scoreDelta))
      ? Number(pending.scoreDelta)
      : defaultScoreForEventType(pending.eventType)
  });
}

function governanceButtons(eventId, options = {}) {
  const eventType = Number.isFinite(Number(options.eventType)) ? Number(options.eventType) : 0;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`confirm:${eventId}:${eventType}`).setLabel("Confirm").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`dismiss:${eventId}`).setLabel("Dismiss").setStyle(ButtonStyle.Secondary)
  );

  if (options.includeProfile) {
    row.addComponents(
      new ButtonBuilder().setCustomId(`view_profile:${eventId}`).setLabel("View Profile").setStyle(ButtonStyle.Primary)
    );
  }

  if (options.enableWriteChain && isTrustedGuild(options.guildId)) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`write_chain:${eventId}`)
        .setLabel("Write to Sepolia")
        .setStyle(ButtonStyle.Success)
    );
  }

  return [row];
}

function profileActionButtons(guildId, discordId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`positive_contribution:${guildId}:${discordId}`).setLabel("Positive Contribution").setStyle(ButtonStyle.Success)
    )
  ];
}

async function fetchGuildConfig(guildId) {
  const response = await api(`/api/guild-config?guildId=${encodeURIComponent(guildId)}`);
  return response.ok ? response.payload : null;
}

async function resolveAdminChannel(guildId) {
  const config = await fetchGuildConfig(guildId);
  return config?.adminChannelId || process.env.DISCORD_ADMIN_CHANNEL_ID;
}

async function sendPendingToAdminChannel(guildId, pending) {
  rememberPendingDefaults(pending);
  const channelId = await resolveAdminChannel(guildId);
  if (!channelId) return false;
  const channel = await client.channels.fetch(channelId).catch(() => undefined);
  if (!channel || channel.type !== ChannelType.GuildText) return false;
  await channel.send({
    content: `Risk pending: ${pending.reason}\nUser: <@${pending.discordId}>\nSummary: ${pending.messageSummary}`,
    components: governanceButtons(pending.id, { eventType: pending.eventType })
  });
  return true;
}

function canSendPublicSuggestion(channelId) {
  const now = Date.now();
  const bucket = publicSuggestionBuckets.get(channelId);
  if (!bucket || bucket.resetAt <= now) {
    publicSuggestionBuckets.set(channelId, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (bucket.count >= 2) return false;
  bucket.count += 1;
  return true;
}

async function sendPublicSafetyHint(message, suggestion) {
  if (!message.channel || !canSendPublicSuggestion(message.channelId)) return;
  const content = [
    `Safety reminder: ${suggestion.title}`,
    "请谨慎处理陌生链接、私聊邀请和未经证实的提现/跑路传言；管理员会继续复核风险信号。"
  ].join("\n");
  await message.channel.send(content).catch(() => undefined);
}

function formatProfile(profile, targetLabel) {
  return [
    `${targetLabel}: ${profile.reviewMode} / score ${profile.trustScore}`,
    `Wallet: ${profile.walletAddress || "unbound"}`,
    `Pass: ${profile.holdings.nftCount > 0 ? "持有通行证" : "未持有"}`,
    `Local: ${profile.signalSummary.localBehavior}`,
    `Global: ${profile.signalSummary.globalReputation}`,
    `Sybil: ${profile.signalSummary.sybilRisk}`,
    `Breakdown: base 60 + holding ${profile.trustBreakdown.holdingScore} + local ${profile.trustBreakdown.localEventScore} + onchain ${profile.trustBreakdown.onchainScoreContribution} - sybil ${profile.trustBreakdown.sybilPenalty} - newWallet ${profile.trustBreakdown.newWalletPenalty}`,
    `Reasons: ${profile.reviewExplanation.join(" | ")}`
  ].join("\n");
}

function formatQueue(payload) {
  const counts = new Map();
  for (const event of payload) counts.set(event.eventType, (counts.get(event.eventType) || 0) + 1);
  const summary = Array.from(counts.entries()).map(([type, count]) => `${count} x ${type}`).join(" / ");
  const recent = payload.slice(0, 3).map((event) => `- ${event.reason}: ${event.discordId}`).join("\n");
  return `Pending total: ${payload.length}\n${summary || "No pending types"}\n${recent || "No pending details"}`;
}

function formatRules(payload) {
  const rules = payload.rules;
  return [
    `Chain write mode: ${payload.chainWriteMode}`,
    `--- Scoring ranges (admin can choose within these) ---`,
    `Warning/FUD: 0 ~ -20 (default -5)`,
    `Spam: -10 ~ -50 (default -30)`,
    `Scam: -30 ~ -100 (default -50)`,
    `Positive Contribution: +5 ~ +20 (default +15)`,
    `Appeal Accepted: +5 ~ +30 (default +20)`,
    ``,
    `--- Automatic scoring ---`,
    `VIP token threshold: >= ${rules.vipTokenThreshold} tokens => +35`,
    `NFT/Pass trust bonus: +${rules.nftTrustBonus}`,
    `New wallet penalty: -${rules.newWalletPenalty}`,
    `Onchain score contribution: -40 to +20`,
    `Sybil risk penalty: up to -60`,
    ``,
    `--- Keyword detection (system-triggered) ---`,
    `Spam: ${rules.spamTerms.join(", ")}`,
    `Scam: ${rules.scamTerms.join(", ")}`,
    `FUD: ${rules.fudTerms.join(", ")}`
  ].join("\n");
}

async function safeErrorReply(interaction, error) {
  console.error(error);
  const content = "Operation failed. Check the bot console for details.";
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content, ...ephemeral() });
    } else {
      await interaction.reply({ content, ...ephemeral() });
    }
  } catch (replyError) {
    console.error(replyError);
  }
}

client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setActivity("on-chain reputation", { type: ActivityType.Watching });
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
      return;
    }
    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }
    if (interaction.isModalSubmit()) {
      await handleModal(interaction);
    }
  } catch (error) {
    await safeErrorReply(interaction, error);
  }
});

async function handleCommand(interaction) {
  const guildId = interaction.guildId || "demo-guild";

  if (interaction.commandName === "bind") {
    await interaction.reply({ content: `Open this link to bind your wallet:\n${bindUrl(interaction)}`, ...ephemeral() });
    return;
  }

  if (interaction.commandName === "help") {
    await interaction.reply({
      content: "Use /bind to link your wallet and /appeal to request a review. Admins can use /config admin-channel, /risk, /queue, /rules, /positive-contribution, /issue-pass, /refresh-pass, /write-batch, and /demo.",
      ...ephemeral()
    });
    return;
  }

  if (interaction.commandName === "config") {
    if (!canManage(interaction)) {
      await interaction.reply({ content: "Administrator permission required.", ...ephemeral() });
      return;
    }
    await interaction.deferReply(ephemeral());
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "admin-channel") {
      const channel = interaction.options.getChannel("channel", true);
      const response = await api("/api/guild-config", {
        method: "POST",
        headers: adminHeaders(interaction.user.id),
        body: JSON.stringify({ guildId, adminChannelId: channel.id })
      });
      await interaction.editReply(response.ok ? `Admin channel saved: <#${channel.id}>` : response.payload.error || "Failed to save admin channel.");
    }
    return;
  }

  await interaction.deferReply(ephemeral());

  if (interaction.commandName === "profile") {
    const profile = await api(`/api/users/${interaction.user.id}/profile?guildId=${guildId}`);
    await interaction.editReply(formatProfile(profile.payload, "Your profile"));
    return;
  }

  if (interaction.commandName === "risk") {
    if (!canManage(interaction)) {
      await interaction.editReply("Administrator permission required.");
      return;
    }
    const user = interaction.options.getUser("user", true);
    const profile = await api(`/api/users/${user.id}/profile?guildId=${guildId}`);
    await interaction.editReply({ content: formatProfile(profile.payload, user.tag), components: profileActionButtons(guildId, user.id) });
    return;
  }

  if (interaction.commandName === "health") {
    const health = await api(`/api/dashboard/health?guildId=${guildId}`);
    const payload = health.payload;
    await interaction.editReply(`Health score: ${payload.healthScore}\nPending: ${payload.stats.pending}\nMessages: ${payload.stats.discordMessages}\nSuggestions: ${payload.suggestions.length}`);
    return;
  }

  if (interaction.commandName === "queue") {
    if (!canManage(interaction)) {
      await interaction.editReply("Administrator permission required.");
      return;
    }
    const queue = await api(`/api/events/pending?guildId=${guildId}`);
    await interaction.editReply(formatQueue(queue.payload));
    return;
  }

  if (interaction.commandName === "rules") {
    const rules = await api("/api/rules");
    await interaction.editReply({ content: formatRules(rules.payload), flags: MessageFlags.Ephemeral | MessageFlags.SuppressEmbeds });
    return;
  }

  if (interaction.commandName === "appeal") {
    const reason = interaction.options.getString("reason", true);
    const response = await api("/api/moderation/appeal", {
      method: "POST",
      body: JSON.stringify({ guildId, discordId: interaction.user.id, reason })
    });
    if (response.payload.pending) await sendPendingToAdminChannel(guildId, response.payload.pending);
    await interaction.editReply(response.ok ? "Appeal submitted for admin review." : response.payload.error || "Failed to submit appeal.");
    return;
  }

  if (interaction.commandName === "positive-contribution") {
    if (!canManage(interaction)) {
      await interaction.editReply("Administrator permission required.");
      return;
    }
    const user = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason") || undefined;
    const response = await api("/api/moderation/positive", {
      method: "POST",
      headers: adminHeaders(interaction.user.id),
      body: JSON.stringify({
        guildId,
        discordId: user.id,
        eventType: 6,
        reason,
        messageSummary: reason ? `Admin positive contribution note: ${reason}` : undefined
      })
    });
    const pending = response.payload.pending;
    rememberPendingDefaults(pending);
    await interaction.editReply({
      content: response.ok ? `Positive contribution pending: ${pending.id}` : response.payload.error || "Failed to create positive contribution.",
      components: response.ok ? governanceButtons(pending.id, { eventType: pending.eventType }) : []
    });
    return;
  }

  if (interaction.commandName === "issue-pass") {
    if (!canManage(interaction)) {
      await interaction.editReply("Administrator permission required.");
      return;
    }
    const user = interaction.options.getUser("user", true);
    const response = await api("/api/member-pass/issue", {
      method: "POST",
      headers: adminHeaders(interaction.user.id),
      body: JSON.stringify({ guildId, discordId: user.id })
    });
    await interaction.editReply(response.ok ? `Pass issued. txHash: ${response.payload.issuance?.txHash || "pending"}` : response.payload.error || "Failed to issue pass.");
    return;
  }

  if (interaction.commandName === "refresh-pass") {
    if (!canManage(interaction)) {
      await interaction.editReply("Administrator permission required.");
      return;
    }
    const user = interaction.options.getUser("user", true);
    const response = await api("/api/member-pass/refresh", {
      method: "POST",
      headers: adminHeaders(interaction.user.id),
      body: JSON.stringify({ guildId, discordId: user.id })
    });
    await interaction.editReply(response.ok ? `Pass status refreshed: ${response.payload.hasPass ? "has pass" : "no pass"}` : response.payload.error || "Failed to refresh pass.");
    return;
  }

  if (interaction.commandName === "write-batch") {
    if (!canManage(interaction)) {
      await interaction.editReply("Administrator permission required.");
      return;
    }
    const limit = interaction.options.getInteger("limit") || 10;
    const response = await api("/api/events/write-batch", {
      method: "POST",
      headers: adminHeaders(interaction.user.id),
      body: JSON.stringify({ guildId, limit })
    });
    await interaction.editReply(
      response.ok
        ? `Batch write complete: ${response.payload.count} records, txHash: ${response.payload.txHash}`
        : response.payload.error || "Failed to batch write records."
    );
    return;
  }

  if (interaction.commandName === "demo") {
    if (!canManage(interaction)) {
      await interaction.editReply("Administrator permission required.");
      return;
    }
    const scenario = interaction.options.getSubcommand();
    const demo = await api("/api/demo/message", {
      method: "POST",
      body: JSON.stringify({ guildId, scenario })
    });
    if (demo.payload.pending) await sendPendingToAdminChannel(guildId, demo.payload.pending);
    await interaction.editReply(demo.payload.feedback || `Demo outcome: ${demo.payload.outcome || "unknown"}`);
  }
}

async function handleButton(interaction) {
  if (!canManage(interaction)) {
    await interaction.reply({ content: "Administrator permission required.", ...ephemeral() });
    return;
  }

  const [action, ...parts] = interaction.customId.split(":");

  if (action === "confirm") {
    const id = parts[0];
    const eventType = parts[1];
    const defaults = pendingDefaults.get(id) || {
      reason: defaultReasonForEventType(eventType),
      scoreDelta: defaultScoreForEventType(eventType)
    };
    const modal = new ModalBuilder().setCustomId(`confirm_modal:${id}:${eventType}`).setTitle("Confirm governance event");
    const reason = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Reason")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(String(defaults.reason).slice(0, 256));
    const scoreDelta = new TextInputBuilder()
      .setCustomId("scoreDelta")
      .setLabel("Score delta")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(String(defaults.scoreDelta));
    modal.addComponents(new ActionRowBuilder().addComponents(reason), new ActionRowBuilder().addComponents(scoreDelta));
    await interaction.showModal(modal);
    return;
  }

  await interaction.deferReply(ephemeral());

  if (action === "dismiss") {
    const response = await api(`/api/events/${parts[0]}/dismiss`, {
      method: "POST",
      headers: adminHeaders(interaction.user.id),
      body: JSON.stringify({})
    });
    await interaction.editReply(response.ok ? "Pending event dismissed." : response.payload.error || "Failed to dismiss event.");
    return;
  }

  if (action === "view_profile") {
    const queue = await api(`/api/events/pending?guildId=${interaction.guildId || "demo-guild"}`);
    const event = queue.payload.find((item) => item.id === parts[0]);
    if (!event) {
      await interaction.editReply("Pending event not found.");
      return;
    }
    const profile = await api(`/api/users/${event.discordId}/profile?guildId=${event.guildId}`);
    await interaction.editReply({ content: formatProfile(profile.payload, event.discordId), components: profileActionButtons(event.guildId, event.discordId) });
    return;
  }

  if (action === "write_chain") {
    const response = await api(`/api/events/${parts[0]}/retry-chain`, {
      method: "POST",
      headers: adminHeaders(interaction.user.id),
      body: JSON.stringify({})
    });
    await interaction.editReply(response.ok ? `Chain write complete: ${response.payload.txHash || "no tx hash"}` : response.payload.error || "Failed to write event on-chain.");
    return;
  }

  if (action === "positive_contribution") {
    const [guildId, discordId] = parts;
    const response = await api("/api/moderation/positive", {
      method: "POST",
      headers: adminHeaders(interaction.user.id),
      body: JSON.stringify({
        guildId,
        discordId,
        eventType: 6
      })
    });
    const pending = response.payload.pending;
    rememberPendingDefaults(pending);
    await interaction.editReply({
      content: response.ok ? `Positive pending event created: ${pending.id}` : response.payload.error || "Failed to create positive event.",
      components: response.ok ? governanceButtons(pending.id, { eventType: pending.eventType }) : []
    });
    return;
  }
}

async function handleModal(interaction) {
  await interaction.deferReply(ephemeral());

  if (!canManage(interaction)) {
    await interaction.editReply("Administrator permission required.");
    return;
  }

  const [action, id, eventType] = interaction.customId.split(":");
  if (action !== "confirm_modal" || !id) {
    await interaction.editReply("Invalid modal.");
    return;
  }
  const reason = interaction.fields.getTextInputValue("reason");
  const scoreDelta = Number(interaction.fields.getTextInputValue("scoreDelta"));

  const rangeError = validateScoreInRange(Number(eventType), scoreDelta);
  if (rangeError) {
    await interaction.editReply(rangeError);
    return;
  }
  const response = await api(`/api/events/${id}/confirm`, {
    method: "POST",
    headers: adminHeaders(interaction.user.id),
    body: JSON.stringify({ reason, scoreDelta })
  });

  if (!response.ok) {
    await interaction.editReply(response.payload.error || "Failed to confirm event.");
    return;
  }

  const record = response.payload;
  const statusMessage =
    record.chainStatus === "awaiting_wallet"
      ? "Governance recorded locally. This user has not bound a wallet yet, so the record will be backfilled after /bind."
      : `Governance recorded with chain status: ${record.chainStatus}`;
  await interaction.editReply({
    content: statusMessage,
    components:
      record.chainStatus === "pending"
        ? governanceButtons(record.id, { guildId: record.guildId, enableWriteChain: true, eventType: record.eventType })
        : []
  });
}

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guildId) return;

  try {
    const result = await api("/api/discord/message", {
      method: "POST",
      body: JSON.stringify({
        guildId: message.guildId,
        discordId: message.author.id,
        authorName: message.author.tag,
        content: message.content
      })
    });

    if (result.payload.pending) await sendPendingToAdminChannel(message.guildId, result.payload.pending);

    if (result.payload.suggestions?.length) {
      await sendPublicSafetyHint(message, result.payload.suggestions[0]);
    }
  } catch (error) {
    console.error(error);
  }
});

client.on("error", (error) => console.error(error));
process.on("unhandledRejection", (error) => console.error(error));

async function main() {
  await waitForApiReady();
  await client.login(token);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
