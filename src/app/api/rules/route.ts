import { NextResponse } from "next/server";
import { appConfig } from "@/lib/config";

export async function GET() {
  return NextResponse.json({
    rules: appConfig.defaultRules,
    chainWriteMode: appConfig.chainWriteMode
  });
}
