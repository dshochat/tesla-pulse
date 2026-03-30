import type { TelemetryPoint, TripSegment } from "@/types/tesla";
import {
  getCachedRoadName,
  cacheRoadName,
  saveTripSegments,
  getTripSegments,
  tripHasSegments,
  getTelemetryRange,
} from "./db";

// ─── Helpers ─────────────────────────────────────────────────────────

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function headingToBucket(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360;
  const buckets = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return buckets[Math.round(normalized / 45) % 8];
}

function headingDiff(a: number, b: number): number {
  const diff = Math.abs(((a - b + 180) % 360) - 180);
  return diff;
}

function toBucket(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function normalizeRoadName(name: string): string {
  if (!name) return "Unknown Road";
  // Standardize highway names
  return name
    .replace(/^(Interstate|Int\.?\s*)\s*/i, "I-")
    .replace(/^(US Highway|US Hwy|US Route|US Rt\.?\s*)\s*/i, "US-")
    .replace(/^(State Highway|State Hwy|SH|TX|State Route)\s*/i, "TX-")
    .replace(/\s+(North|South|East|West|Northbound|Southbound|Eastbound|Westbound)$/i, "")
    .trim();
}

// ─── Segment Grouping ────────────────────────────────────────────────

interface RawSegment {
  points: TelemetryPoint[];
  startIdx: number;
  endIdx: number;
}

export function groupIntoSegments(points: TelemetryPoint[]): RawSegment[] {
  if (points.length < 2) return [];

  const segments: RawSegment[] = [];
  let segStart = 0;

  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const segStartPt = points[segStart];

    // Distance from segment start
    const dist = haversineMeters(segStartPt.latitude, segStartPt.longitude, p.latitude, p.longitude);

    // Heading change from segment average
    const avgHeading = points.slice(segStart, i).reduce((s, pt) => s + pt.heading, 0) / (i - segStart);
    const headingChange = headingDiff(avgHeading, p.heading);

    // Speed-based threshold: relax heading on highway
    const isHighway = (p.speed ?? 0) > 50;
    const headingThreshold = isHighway ? 45 : 30;

    // Stopped for >10s (speed=0 for multiple points at 15s intervals)
    const prevPt = points[i - 1];
    const stopped = (p.speed ?? 0) === 0 && (prevPt.speed ?? 0) === 0;

    const shouldSplit = dist > 200 || headingChange > headingThreshold || stopped;

    if (shouldSplit && i - segStart >= 2) {
      segments.push({ points: points.slice(segStart, i), startIdx: segStart, endIdx: i - 1 });
      segStart = i;
    }
  }

  // Last segment
  if (points.length - segStart >= 2) {
    segments.push({ points: points.slice(segStart), startIdx: segStart, endIdx: points.length - 1 });
  }

  return segments;
}

// ─── Segment Metrics ─────────────────────────────────────────────────

function computeSegmentMetrics(tripId: string, segOrder: number, points: TelemetryPoint[]): Omit<TripSegment, "id" | "road_name" | "road_type"> {
  const first = points[0];
  const last = points[points.length - 1];
  const durationSec = (last.timestamp - first.timestamp) / 1000;
  const distMiles = Math.abs(last.odometer - first.odometer);

  const speeds = points.filter((p) => p.speed && p.speed > 0).map((p) => p.speed!);
  const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;

  // Energy: integrate power over time
  let totalEnergyKwh = 0;
  for (let i = 1; i < points.length; i++) {
    const dt = (points[i].timestamp - points[i - 1].timestamp) / 3600000; // hours
    totalEnergyKwh += Math.abs(points[i].power) * dt;
  }

  const avgPower = points.reduce((s, p) => s + Math.abs(p.power), 0) / points.length;
  const whPerMile = distMiles > 0.01 ? (totalEnergyKwh * 1000) / distMiles : 0;

  const headings = points.map((p) => p.heading);
  const avgHeading = headings.reduce((a, b) => a + b, 0) / headings.length;

  const polyline = points.map((p) => [p.latitude, p.longitude]);

  return {
    trip_id: tripId,
    segment_order: segOrder,
    start_lat: first.latitude,
    start_lng: first.longitude,
    end_lat: last.latitude,
    end_lng: last.longitude,
    avg_heading: Math.round(avgHeading),
    heading_bucket: headingToBucket(avgHeading),
    distance_miles: Math.round(distMiles * 100) / 100,
    duration_sec: Math.round(durationSec),
    avg_speed_mph: Math.round(avgSpeed * 10) / 10,
    avg_power_kw: Math.round(avgPower * 10) / 10,
    energy_kwh: Math.round(totalEnergyKwh * 1000) / 1000,
    wh_per_mile: Math.round(whPerMile),
    point_count: points.length,
    polyline_json: JSON.stringify(polyline),
  };
}

// ─── Reverse Geocoding ───────────────────────────────────────────────

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";

async function reverseGeocode(lat: number, lng: number): Promise<{ road_name: string; road_type: string; city: string }> {
  const latB = toBucket(lat);
  const lngB = toBucket(lng);

  // Check cache first
  const cached = getCachedRoadName(latB, lngB);
  if (cached) return cached;

  // Rate limit: 1 req/sec
  await new Promise((r) => setTimeout(r, 1100));

  try {
    const url = `${NOMINATIM_URL}?lat=${lat}&lon=${lng}&format=json&zoom=16&addressdetails=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "TeslaPulse/1.0 (telemetry dashboard)" },
    });

    if (!res.ok) {
      console.warn(`[Geocode] Nominatim returned ${res.status}`);
      const fallback = { road_name: "Unknown Road", road_type: "unknown", city: "" };
      cacheRoadName(latB, lngB, fallback.road_name, fallback.road_type, fallback.city);
      return fallback;
    }

    const data = await res.json();
    const addr = data.address || {};
    const roadName = normalizeRoadName(addr.road || addr.highway || addr.pedestrian || addr.path || data.name || "Unknown Road");
    const roadType = data.type || addr.road_type || "unknown";
    const city = addr.city || addr.town || addr.village || addr.county || "";

    cacheRoadName(latB, lngB, roadName, roadType, city);
    console.log(`[Geocode] ${lat.toFixed(4)},${lng.toFixed(4)} → ${roadName} (${roadType})`);

    return { road_name: roadName, road_type: roadType, city };
  } catch (err) {
    console.warn(`[Geocode] Failed:`, err instanceof Error ? err.message : err);
    const fallback = { road_name: "Unknown Road", road_type: "unknown", city: "" };
    cacheRoadName(latB, lngB, fallback.road_name, fallback.road_type, fallback.city);
    return fallback;
  }
}

// ─── Geocode for Coach (with distance-based caching) ─────────────────

let lastGeocodedLat = 0;
let lastGeocodedLng = 0;
let lastRoadName = "";

export function getCurrentRoadName(lat: number, lng: number): string {
  // Check if we've moved >300m from last geocoded point
  if (lastRoadName) {
    const dist = haversineMeters(lastGeocodedLat, lastGeocodedLng, lat, lng);
    if (dist < 300) return lastRoadName;
  }

  // Check cache synchronously
  const cached = getCachedRoadName(toBucket(lat), toBucket(lng));
  if (cached?.road_name) {
    lastGeocodedLat = lat;
    lastGeocodedLng = lng;
    lastRoadName = cached.road_name;
    return cached.road_name;
  }

  // Queue async geocode (non-blocking for coach)
  reverseGeocode(lat, lng).then((r) => {
    lastGeocodedLat = lat;
    lastGeocodedLng = lng;
    lastRoadName = r.road_name;
  }).catch(() => {});

  return lastRoadName || "Unknown Road";
}

// ─── Main Analysis Pipeline ──────────────────────────────────────────

export async function analyzeTripsSegments(tripId: string, tripPoints: TelemetryPoint[]): Promise<void> {
  // Skip if already analyzed
  if (tripHasSegments(tripId)) return;

  // Filter to valid driving points
  const drivingPts = tripPoints.filter(
    (p) => p.latitude !== 0 && p.longitude !== 0 && p.odometer > 1
  );

  if (drivingPts.length < 4) {
    console.log(`[Segments] Skipping ${tripId} — only ${drivingPts.length} valid points`);
    return;
  }

  console.log(`[Segments] Analyzing ${tripId}: ${drivingPts.length} points`);

  // Group into segments
  const rawSegments = groupIntoSegments(drivingPts);
  if (rawSegments.length === 0) {
    console.log(`[Segments] No segments found for ${tripId}`);
    return;
  }

  // Compute metrics and geocode each segment
  const segments: TripSegment[] = [];
  for (let i = 0; i < rawSegments.length; i++) {
    const raw = rawSegments[i];
    const metrics = computeSegmentMetrics(tripId, i, raw.points);

    // Geocode midpoint of segment
    const midIdx = Math.floor(raw.points.length / 2);
    const midPt = raw.points[midIdx];
    const geo = await reverseGeocode(midPt.latitude, midPt.longitude);

    segments.push({
      ...metrics,
      road_name: geo.road_name,
      road_type: geo.road_type,
    });
  }

  // Save to DB
  saveTripSegments(tripId, segments);
  console.log(`[Segments] Saved ${segments.length} segments for ${tripId}`);
}

/**
 * Backfill segments for existing trips that don't have them yet.
 * Returns number of trips processed.
 */
export async function backfillTripSegments(): Promise<number> {
  const { getTrips } = require("./db");
  const trips = getTrips(50) as Array<{ id: string; started_at: number; ended_at: number }>;
  let processed = 0;

  for (const trip of trips) {
    if (tripHasSegments(trip.id)) continue;

    const points = getTelemetryRange(trip.started_at, trip.ended_at);
    if (points.length < 4) continue;

    try {
      await analyzeTripsSegments(trip.id, points);
      processed++;
    } catch (err) {
      console.error(`[Segments] Backfill failed for ${trip.id}:`, err instanceof Error ? err.message : err);
    }
  }

  if (processed > 0) {
    console.log(`[Segments] Backfilled ${processed} trip(s)`);
  }
  return processed;
}

/**
 * Build a segment summary string for the AI trip summary prompt.
 */
export function buildSegmentSummary(tripId: string): string {
  const segments = getTripSegments(tripId);
  if (segments.length === 0) return "";

  const sorted = [...segments].sort((a, b) => b.wh_per_mile - a.wh_per_mile);
  const worst = sorted.slice(0, 3);
  const best = sorted.slice(-3).reverse();

  const formatSeg = (s: TripSegment) =>
    `${s.road_name || "Unknown"} ${s.heading_bucket}: ${s.distance_miles.toFixed(1)} mi, ${s.wh_per_mile} Wh/mi, avg ${Math.round(s.avg_speed_mph)} mph, ${s.avg_power_kw} kW`;

  let summary = "\nTRIP SEGMENTS (sorted by Wh/mi, worst first):";
  worst.forEach((s, i) => {
    summary += `\n${i + 1}. ${formatSeg(s)}`;
  });

  summary += "\n\nMOST EFFICIENT SEGMENTS:";
  best.forEach((s, i) => {
    summary += `\n${i + 1}. ${formatSeg(s)}`;
  });

  return summary;
}
