import { getSegmentStatsByRoad, upsertHotspot, getHotspots } from "./db";
import type { EfficiencyHotspot } from "@/types/tesla";

/**
 * Recalculate efficiency hotspots from all trip_segments data.
 * A road is a "hotspot" if it appears in 2+ trips and has avg Wh/mi > 300
 * or is >20% above the user's overall average.
 */
export function updateHotspots(): void {
  const stats = getSegmentStatsByRoad();
  if (stats.length === 0) return;

  // Compute overall average Wh/mi across all segments
  const totalWh = stats.reduce((s, r) => s + r.avg_wh * r.trip_count, 0);
  const totalTrips = stats.reduce((s, r) => s + r.trip_count, 0);
  const overallAvg = totalTrips > 0 ? totalWh / totalTrips : 260;

  const threshold = Math.max(300, overallAvg * 1.2);

  for (const s of stats) {
    const isHotspot = s.avg_wh > threshold;

    const hotspot: EfficiencyHotspot = {
      road_name: s.road_name,
      heading_bucket: s.heading_bucket,
      trip_count: s.trip_count,
      avg_wh_per_mile: Math.round(s.avg_wh),
      worst_wh_per_mile: Math.round(s.worst_wh),
      best_wh_per_mile: Math.round(s.best_wh),
      avg_speed_mph: Math.round(s.avg_speed),
      last_updated: Date.now(),
      is_hotspot: isHotspot,
    };

    upsertHotspot(hotspot);
  }

  const active = getHotspots(10);
  if (active.length > 0) {
    console.log(`[Hotspots] ${active.length} active hotspot(s): ${active.map((h) => `${h.road_name} ${h.heading_bucket} (${h.avg_wh_per_mile} Wh/mi)`).join(", ")}`);
  }
}

/**
 * Build a hotspot context string for AI prompts.
 */
export function buildHotspotContext(): string {
  const hotspots = getHotspots(5);
  if (hotspots.length === 0) return "";

  let ctx = "EFFICIENCY HOT SPOTS:";
  for (const h of hotspots) {
    ctx += `\n- ${h.road_name} ${h.heading_bucket}: avg ${h.avg_wh_per_mile} Wh/mi across ${h.trip_count} trips (worst: ${h.worst_wh_per_mile}, best: ${h.best_wh_per_mile})`;
  }
  return ctx;
}

/**
 * Check if a given road name is a known hotspot.
 */
export function isHotspot(roadName: string): EfficiencyHotspot | null {
  const hotspots = getHotspots(20);
  return hotspots.find((h) => h.road_name === roadName) ?? null;
}
