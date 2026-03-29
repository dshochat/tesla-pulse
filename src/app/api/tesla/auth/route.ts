import { NextRequest, NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/tesla-auth";

export async function GET(request: NextRequest) {
  try {
    const host = request.headers.get("host") || undefined;
    const url = getAuthUrl(host);
    return NextResponse.redirect(url);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Auth initialization failed" },
      { status: 500 }
    );
  }
}
