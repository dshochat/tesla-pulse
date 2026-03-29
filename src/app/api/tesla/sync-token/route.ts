import { NextRequest, NextResponse } from "next/server";
import { importTokens } from "@/lib/tesla-auth";
import { getSettings } from "@/lib/settings";

export async function POST(request: NextRequest) {
  try {
    const { access_token, refresh_token } = (await request.json()) as {
      access_token?: string;
      refresh_token?: string;
    };

    if (!access_token) {
      return NextResponse.json(
        { error: "access_token is required" },
        { status: 400 }
      );
    }

    importTokens(access_token, refresh_token || "");

    return NextResponse.json({
      success: true,
      message: "Tokens synced successfully",
      expires_at: getSettings().tesla_token_expires_at,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Token sync failed" },
      { status: 500 }
    );
  }
}

/** GET returns token status (no actual tokens exposed) */
export async function GET() {
  const settings = getSettings();
  return NextResponse.json({
    has_access_token: !!settings.tesla_access_token,
    has_refresh_token: !!settings.tesla_refresh_token,
    expires_at: settings.tesla_token_expires_at,
    expired: settings.tesla_token_expires_at > 0 && settings.tesla_token_expires_at < Date.now(),
  });
}
