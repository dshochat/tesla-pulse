import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";

/**
 * Server-side proxy: authenticates with production, then pushes local tokens.
 * Avoids CORS issues since this is server-to-server.
 */
export async function POST(request: NextRequest) {
  try {
    const { password } = (await request.json()) as { password: string };
    const settings = getSettings();
    const prodUrl = settings.production_url;

    if (!prodUrl) {
      return NextResponse.json({ error: "No production URL configured" }, { status: 400 });
    }

    if (!settings.tesla_access_token) {
      return NextResponse.json({ error: "No local tokens to push" }, { status: 400 });
    }

    // Step 1: Login to production to get session cookie
    const loginRes = await fetch(`${prodUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!loginRes.ok) {
      const data = await loginRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: data.error || `Production auth failed: ${loginRes.status}` },
        { status: 401 }
      );
    }

    // Extract session cookie
    const setCookie = loginRes.headers.get("set-cookie") || "";

    // Step 2: Push tokens using the session
    const pushRes = await fetch(`${prodUrl}/api/tesla/sync-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: setCookie,
      },
      body: JSON.stringify({
        access_token: settings.tesla_access_token,
        refresh_token: settings.tesla_refresh_token || "",
      }),
    });

    if (!pushRes.ok) {
      const data = await pushRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: data.error || `Token push failed: ${pushRes.status}` },
        { status: pushRes.status }
      );
    }

    const result = await pushRes.json();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Push failed" },
      { status: 500 }
    );
  }
}
