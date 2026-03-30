import { NextResponse } from "next/server";
import { getTrips, getTelemetryRange, updateTripAI } from "@/lib/db";
import { getProvider, buildTripContext } from "@/lib/llm/provider";

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

/** POST: Generate AI summaries for trips that don't have them */
export async function POST() {
  try {
    const trips = getTrips(20);
    const missing = trips.filter((t) => !t.ai_summary);

    if (missing.length === 0) {
      return NextResponse.json({ message: "All trips have AI summaries", generated: 0 });
    }

    let generated = 0;
    const provider = getProvider();

    for (const trip of missing) {
      try {
        // Get telemetry for this trip's time range
        const points = getTelemetryRange(trip.started_at, trip.ended_at);

        if (points.length < 2) {
          console.log(`[Trips] Skipping ${trip.id} — not enough telemetry points`);
          continue;
        }

        const ctx = buildTripContext(points);
        const ai = await provider.generateTripSummary(ctx);

        updateTripAI(trip.id, {
          summary: ai.summary,
          score: ai.efficiency_score,
          highlights: JSON.stringify(ai.highlights),
          tip: ai.tip,
        });

        generated++;
        console.log(`[Trips] AI summary generated for ${trip.id}`);
      } catch (err) {
        console.error(`[Trips] Failed to generate summary for ${trip.id}:`, err instanceof Error ? err.message : err);
      }
    }

    return NextResponse.json({ message: `Generated ${generated} AI summaries`, generated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate summaries" },
      { status: 500 }
    );
  }
}
