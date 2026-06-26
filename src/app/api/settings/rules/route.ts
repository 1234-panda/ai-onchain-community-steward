import { NextResponse } from "next/server";
import { defaultRules } from "@/lib/config";

export async function GET() {
  return NextResponse.json(defaultRules);
}

export async function POST(request: Request) {
  void request;
  return NextResponse.json(
    { error: "Rules are read-only. Update src/lib/config.ts and redeploy to change them." },
    { status: 405 }
  );
}
