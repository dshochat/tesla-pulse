import { NextRequest, NextResponse } from "next/server";
import { getProvider, buildTripContext } from "@/lib/llm/provider";
import { telemetryStore } from "@/lib/telemetry-store";
import { updateTripAI } from "@/lib/db";
import { mockTrips } from "@/lib/mock-data";
import { isDemoModeFromSettings as isDemoMode } from "@/lib/settings";

export async function POST(request: NextRequest) {
  try {
    if (isDemoMode()) {
      const trip = mockTrips[0];
      return NextResponse.json({
        summary: trip.ai_summary,
        efficiency_score: trip.ai_efficiency_score,
        highlights: JSON.parse(trip.ai_highlights || "[]"),
        tip: trip.ai_tip,
      });
    }

    const body = await request.json();
    const { tripId } = body as { tripId?: string };

    const tripData = telemetryStore.getCurrentTrip();
    if (tripData.length < 2) {
      return NextResponse.json(
        { error: "Not enough trip data to summarize" },
        { status: 400 }
      );
    }

    const ctx = buildTripContext(tripData);
    const provider = getProvider();
    const result = await provider.generateTripSummary(ctx);

    if (tripId) {
      try {
        updateTripAI(tripId, {
          summary: result.summary,
          score: result.efficiency_score,
          highlights: JSON.stringify(result.highlights),
          tip: result.tip,
        });
      } catch {
        // non-critical
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Trip summary failed" },
      { status: 500 }
    );
  }
}
