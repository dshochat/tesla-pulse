import { NextResponse } from "next/server";
import { getPollerStatus, isBrowserConnected } from "@/lib/background-poller";
import { getSettings } from "@/lib/settings";

export async function GET() {
  return NextResponse.json({
    status: getPollerStatus(),
    enabled: getSettings().background_polling,
    browserConnected: isBrowserConnected(),
  });
}
