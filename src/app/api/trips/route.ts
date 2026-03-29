import { NextResponse } from "next/server";
import { getTrips } from "@/lib/db";

export async function GET() {
  try {
    const trips = getTrips(20);
    return NextResponse.json({ trips });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load trips" },
      { status: 500 }
    );
  }
}
