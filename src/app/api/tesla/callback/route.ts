import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/tesla-auth";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.json({ error: `Tesla auth error: ${error}` }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: "No authorization code received" }, { status: 400 });
  }

  try {
    const host = request.headers.get("host") || undefined;
    const tokens = await exchangeCode(code, host);

    console.log("\n=== Tesla OAuth Success ===");
    console.log(`Expires at: ${new Date(tokens.expires_at!).toISOString()}`);
    console.log("Tokens are stored in memory and will persist for this server session.");
    console.log("===========================\n");

    // Redirect to dashboard
    return NextResponse.redirect(new URL("/", request.url));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Token exchange failed" },
      { status: 500 }
    );
  }
}
