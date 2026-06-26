import { describe, expect, it } from "vitest";
import { analyzeCommunity } from "../src/lib/agent";

const messages = [
  {
    id: "1",
    guildId: "demo-guild",
    discordId: "u1",
    authorName: "A",
    content: "我不能提现，是不是提现困难？",
    source: "demo" as const,
    createdAt: new Date().toISOString()
  },
  {
    id: "2",
    guildId: "demo-guild",
    discordId: "u2",
    authorName: "B",
    content: "会不会跑路？感觉资金盘要崩盘",
    source: "demo" as const,
    createdAt: new Date().toISOString()
  }
];

describe("agent", () => {
  it("creates advice-only warning for growing withdrawal concerns", async () => {
    const suggestions = await analyzeCommunity(messages);

    expect(suggestions[0].isAdviceOnly).toBe(true);
    expect(suggestions[0].recommendation).toContain("管理员");
  });

  it("uses a stable id for the same risk signature", async () => {
    const first = await analyzeCommunity(messages);
    const second = await analyzeCommunity(messages);

    expect(first[0].id).toBe(second[0].id);
    expect(first[0].riskSignature).toBe(second[0].riskSignature);
  });
});
