import { NextResponse } from "next/server";
import { z } from "zod";
import { defaultGuildId } from "@/lib/config";
import { requireAdmin } from "@/lib/security";
import { findGuildConfig, upsertGuildConfig } from "@/lib/store";

const schema = z.object({
  guildId: z.string().min(1),
  adminChannelId: z.string().min(1),
  demoMode: z.boolean().optional()
});

export async function GET(request: Request) {
  const guildId = defaultGuildId(new URL(request.url).searchParams.get("guildId") ?? undefined);
  return NextResponse.json(findGuildConfig(guildId) ?? null);
}

export async function POST(request: Request) {
  let adminId: string;
  try {
    adminId = requireAdmin(request);
  } catch {
    return NextResponse.json({ error: "Admin permission required" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = findGuildConfig(parsed.data.guildId);
  const config = {
    guildId: parsed.data.guildId,
    adminChannelId: parsed.data.adminChannelId,
    demoMode: parsed.data.demoMode ?? existing?.demoMode ?? true,
    updatedAt: new Date().toISOString()
  };
  upsertGuildConfig(config);

  return NextResponse.json({ config, updatedBy: adminId });
}
