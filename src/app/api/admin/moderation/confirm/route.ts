import { NextResponse } from "next/server";
import { classifyMessage } from "@/lib/rules";
import { requireAdmin } from "@/lib/security";

export async function POST(request: Request) {
  try {
    requireAdmin(request);
  } catch {
    return NextResponse.json({ error: "Admin permission required" }, { status: 403 });
  }

  const body = (await request.json()) as { content?: string };
  const decision = body.content ? classifyMessage(body.content) : undefined;

  return NextResponse.json({
    requiresHumanConfirmation: true,
    aiAdviceOnly: true,
    suggestedRuleAction: decision ?? null
  });
}
