import { NextResponse } from "next/server";
import { resetDemoData } from "@/lib/store";

export async function POST() {
  resetDemoData();
  return NextResponse.json({ ok: true });
}
