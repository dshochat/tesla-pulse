import { NextRequest, NextResponse } from "next/server";
import { getBatteryHealthSummary } from "@/lib/battery-health";
import { isDemoModeFromSettings } from "@/lib/settings";
import { mockBatteryHealthSummary } from "@/lib/mock-data";

export async function GET(request: NextRequest) {
  try {
    const demo = request.nextUrl.searchParams.get("demo") === "true" || isDemoModeFromSettings();

    if (demo) {
      return NextResponse.json(mockBatteryHealthSummary());
    }

    const summary = getBatteryHealthSummary();
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch battery health" },
      { status: 500 }
    );
  }
}
