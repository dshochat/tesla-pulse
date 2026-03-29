import { NextRequest, NextResponse } from "next/server";
import { setPassword, isPasswordSet, createSessionToken, COOKIE_NAME } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    // Only allow setup if no password is set yet
    if (isPasswordSet()) {
      return NextResponse.json({ error: "Password already configured" }, { status: 400 });
    }

    const { password } = (await request.json()) as { password: string };

    if (!password || password.length < 4) {
      return NextResponse.json({ error: "Password must be at least 4 characters" }, { status: 400 });
    }

    await setPassword(password);
    const token = createSessionToken();

    const res = NextResponse.json({ success: true });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Setup failed" },
      { status: 500 }
    );
  }
}
