import { NextRequest, NextResponse } from "next/server";
import { getTrips, getTelemetryRange, updateTripAI, getTripSegments, getHotspots } from "@/lib/db";
import { getProvider, buildTripContext } from "@/lib/llm/provider";
import { backfillTripSegments, buildSegmentSummary } from "@/lib/route-segments";
import { updateHotspots } from "@/lib/route-patterns";

export async function GET() {
  try {
    const trips = getTrips(20);
    // Attach segments to each trip
    const tripsWithSegments = trips.map((t) => ({
      ...t,
      segments: getTripSegments(t.id),
    }));
    const hotspots = getHotspots(10);
    return NextResponse.json({ trips: tripsWithSegments, hotspots });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load trips" },
      { status: 500 }
    );
  }
}

/** POST: Generate AI summaries and/or backfill segments */
export async function POST(request: NextRequest) {
  try {
    let body: { action?: string } = {};
    try { body = await request.json(); } catch { /* no body = default action */ }

    // Backfill segments for trips that don't have them
    if (body.action === "backfill-segments") {
      const processed = await backfillTripSegments();
      if (processed > 0) {
        try { updateHotspots(); } catch { /* non-critical */ }
      }
      return NextResponse.json({ message: `Backfilled segments for ${processed} trip(s)`, processed });
    }

    // Default: generate AI summaries for trips missing them
    const trips = getTrips(20);
    const missing = trips.filter((t) => !t.ai_summary);

    if (missing.length === 0) {
      return NextResponse.json({ message: "All trips have AI summaries", generated: 0 });
    }

    let generated = 0;
    const provider = getProvider();

    for (const trip of missing) {
      try {
        const points = getTelemetryRange(trip.started_at, trip.ended_at);
        if (points.length < 2) continue;

        const ctx = buildTripContext(points);
        // Include segment data if available
        const segSummary = buildSegmentSummary(trip.id);
        if (segSummary) ctx.summary += segSummary;

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
        console.error(`[Trips] Failed for ${trip.id}:`, err instanceof Error ? err.message : err);
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
