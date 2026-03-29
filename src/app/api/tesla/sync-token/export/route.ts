import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";

/** Returns actual token values — only callable from authenticated sessions */
export async function GET() {
  const settings = getSettings();

  if (!settings.tesla_access_token) {
    return NextResponse.json({ error: "No tokens available" }, { status: 404 });
  }

  return NextResponse.json({
    access_token: settings.tesla_access_token,
    refresh_token: settings.tesla_refresh_token,
  });
}
