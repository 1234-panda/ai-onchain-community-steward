import { NextResponse } from "next/server";
import { confirmPendingEvent } from "@/lib/moderation";
import { requireAdmin } from "@/lib/security";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let adminId: string;
  try {
    adminId = requireAdmin(request);
  } catch {
    return NextResponse.json({ error: "Admin permission required" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { reason?: string; scoreDelta?: number };
  const record = await confirmPendingEvent(id, adminId, body);
  if (!record) {
    return NextResponse.json({ error: "Pending event not found" }, { status: 404 });
  }
  return NextResponse.json(record);
}
