import { NextResponse } from "next/server";
import { getProvider, buildTelemetryContext } from "@/lib/llm/provider";
import { telemetryStore } from "@/lib/telemetry-store";
import { mockCoachTips } from "@/lib/mock-data";
import { isDemoModeFromSettings as isDemoMode } from "@/lib/settings";
import { getCurrentRoadName } from "@/lib/route-segments";
import { isHotspot, buildHotspotContext } from "@/lib/route-patterns";

export async function GET() {
  try {
    if (isDemoMode()) {
      const tip = mockCoachTips[Math.floor(Math.random() * mockCoachTips.length)];
      return NextResponse.json({ tip: tip.tip, timestamp: Date.now() });
    }

    const recent = telemetryStore.getRecent(1);
    if (recent.length === 0) {
      return NextResponse.json({
        tip: "Start driving to receive efficiency coaching.",
        timestamp: Date.now(),
      });
    }

    const ctx = buildTelemetryContext(recent);

    // Enrich with location-aware context
    const latest = telemetryStore.latest;
    if (latest && latest.latitude && latest.longitude) {
      const roadName = getCurrentRoadName(latest.latitude, latest.longitude);
      let locationCtx = `\nCurrent road: ${roadName}`;

      // Check if this road is a known hotspot
      const hotspot = isHotspot(roadName);
      if (hotspot) {
        locationCtx += ` (HOTSPOT: avg ${hotspot.avg_wh_per_mile} Wh/mi over ${hotspot.trip_count} trips, worst: ${hotspot.worst_wh_per_mile})`;
      }

      // Current segment efficiency from recent points on this road
      const recentOnRoad = recent.filter((p) => p.speed && p.speed > 0);
      if (recentOnRoad.length >= 2) {
        const first = recentOnRoad[0];
        const last = recentOnRoad[recentOnRoad.length - 1];
        const dist = Math.abs(last.odometer - first.odometer);
        if (dist > 0.05) {
          const batt = first.battery_level - last.battery_level;
          const energy = (batt / 100) * 75;
          const whPerMile = Math.round((energy * 1000) / dist);
          locationCtx += `\nCurrent segment efficiency: ${whPerMile} Wh/mi`;
        }
      }

      // Best/worst segments from current trip
      const tripPoints = telemetryStore.getCurrentTrip();
      if (tripPoints.length > 10) {
        const speeds = tripPoints.filter((p) => p.speed && p.speed > 0);
        const maxPower = Math.max(...speeds.map((p) => Math.abs(p.power)));
        const avgPower = speeds.reduce((s, p) => s + Math.abs(p.power), 0) / speeds.length;
        locationCtx += `\nTrip so far: peak ${maxPower.toFixed(0)} kW, avg ${avgPower.toFixed(0)} kW draw`;
      }

      ctx.summary += locationCtx;
    }

    const provider = getProvider();
    const tip = await provider.generateCoachTip(ctx);
    return NextResponse.json({ tip, timestamp: Date.now() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Coach failed" },
      { status: 500 }
    );
  }
}
