import { NextRequest, NextResponse } from "next/server";
import { listVehicles } from "@/lib/tesla-api";
import { mockVehicle } from "@/lib/mock-data";
import { isDemoModeFromSettings } from "@/lib/settings";

export async function GET(request: NextRequest) {
  try {
    const demo = request.nextUrl.searchParams.get("demo") === "true" || isDemoModeFromSettings();

    if (demo) {
      return NextResponse.json({ vehicles: [mockVehicle] });
    }

    const vehicles = await listVehicles();
    return NextResponse.json({ vehicles });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch vehicles" },
      { status: 500 }
    );
  }
}
