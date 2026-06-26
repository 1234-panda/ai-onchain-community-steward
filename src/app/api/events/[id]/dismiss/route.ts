import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import { removePendingEvent } from "@/lib/store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireAdmin(request);
  } catch {
    return NextResponse.json({ error: "Admin permission required" }, { status: 403 });
  }

  const { id } = await context.params;
  const event = removePendingEvent(id);
  if (!event) {
    return NextResponse.json({ error: "Pending event not found" }, { status: 404 });
  }

  return NextResponse.json({ dismissed: true, event });
}
