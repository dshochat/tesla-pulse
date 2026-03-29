import { NextRequest, NextResponse } from "next/server";
import { verifyPassword, setPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { currentPassword, newPassword } = (await request.json()) as {
      currentPassword: string;
      newPassword: string;
    };

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Both passwords required" }, { status: 400 });
    }

    if (newPassword.length < 4) {
      return NextResponse.json({ error: "New password must be at least 4 characters" }, { status: 400 });
    }

    const valid = await verifyPassword(currentPassword);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
    }

    await setPassword(newPassword);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to change password" },
      { status: 500 }
    );
  }
}
