require("./load-env.cjs").loadEnv();
const {
  ChannelType,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

async function main() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;
  const forceGlobal = process.argv.includes("--global");

  if (!token || !clientId) {
    throw new Error("DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID are required.");
  }

  const commands = [
    new SlashCommandBuilder().setName("bind").setDescription("Get your wallet binding link"),
    new SlashCommandBuilder().setName("profile").setDescription("Show your on-chain community profile"),
    new SlashCommandBuilder()
      .setName("risk")
      .setDescription("Admin: inspect a member risk profile")
      .addUserOption((option) => option.setName("user").setDescription("Discord user").setRequired(true)),
    new SlashCommandBuilder().setName("health").setDescription("Show community health summary"),
    new SlashCommandBuilder().setName("queue").setDescription("Admin: show pending moderation summary"),
    new SlashCommandBuilder().setName("rules").setDescription("Show the global moderation and reputation rules"),
    new SlashCommandBuilder()
      .setName("appeal")
      .setDescription("Submit an appeal for admin review")
      .addStringOption((option) =>
        option.setName("reason").setDescription("Why you believe the moderation was wrong").setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("positive-contribution")
      .setDescription("Admin: reward a member for a positive community contribution")
      .addUserOption((option) => option.setName("user").setDescription("Discord user").setRequired(true))
      .addStringOption((option) =>
        option.setName("reason").setDescription("Contribution reason").setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName("issue-pass")
      .setDescription("Admin: issue a global community pass to a trusted member")
      .addUserOption((option) => option.setName("user").setDescription("Discord user").setRequired(true)),
    new SlashCommandBuilder()
      .setName("refresh-pass")
      .setDescription("Admin: refresh a member's community pass status")
      .addUserOption((option) => option.setName("user").setDescription("Discord user").setRequired(true)),
    new SlashCommandBuilder()
      .setName("write-batch")
      .setDescription("Admin: write pending reputation records to Sepolia in one batch")
      .addIntegerOption((option) =>
        option
          .setName("limit")
          .setDescription("Maximum records to write, 1-25")
          .setMinValue(1)
          .setMaxValue(25)
          .setRequired(false)
      ),
    new SlashCommandBuilder().setName("help").setDescription("Explain how this steward works"),
    new SlashCommandBuilder()
      .setName("config")
      .setDescription("Admin: configure this guild")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("admin-channel")
          .setDescription("Set the admin operations channel for this guild")
          .addChannelOption((option) =>
            option
              .setName("channel")
              .setDescription("Private admin channel")
              .setRequired(true)
              .addChannelTypes(ChannelType.GuildText)
          )
      ),
    new SlashCommandBuilder()
      .setName("demo")
      .setDescription("Admin: inject demo scenarios without polluting real bindings")
      .addSubcommand((subcommand) => subcommand.setName("spam").setDescription("Simulate a new wallet posting spam"))
      .addSubcommand((subcommand) => subcommand.setName("vip").setDescription("Simulate a VIP user asking a normal question"))
      .addSubcommand((subcommand) => subcommand.setName("fud").setDescription("Simulate withdrawal or FUD discussion"))
      .addSubcommand((subcommand) => subcommand.setName("repeat").setDescription("Simulate a repeat spammer"))
      .addSubcommand((subcommand) => subcommand.setName("contribution").setDescription("Simulate a positive contribution event"))
  ].map((command) => command.toJSON());

  const rest = new REST({ version: "10" }).setToken(token);
  const route = !forceGlobal && guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);

  await rest.put(route, { body: commands });
  console.log(`Registered ${commands.length} Discord commands${!forceGlobal && guildId ? ` for guild ${guildId}` : " globally"}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
