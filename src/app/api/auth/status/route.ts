import { NextResponse } from "next/server";
import { isPasswordSet } from "@/lib/auth";

export async function GET() {
  return NextResponse.json({
    passwordSet: isPasswordSet(),
  });
}
