import Database from "better-sqlite3";
import path from "path";
import type { Trip, TelemetryPoint, Anomaly } from "@/types/tesla";

const DB_PATH = path.join(process.cwd(), "teslapulse.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = normal");
    initSchema();
  }
  return db;
}

function initSchema() {
  const d = getDb();

  d.exec(`
    CREATE TABLE IF NOT EXISTS telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      speed REAL,
      power REAL NOT NULL,
      battery_level REAL NOT NULL,
      battery_range REAL NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      heading REAL NOT NULL,
      inside_temp REAL NOT NULL,
      outside_temp REAL NOT NULL,
      shift_state TEXT,
      charging_state TEXT NOT NULL,
      charge_rate REAL NOT NULL,
      charger_power REAL NOT NULL,
      odometer REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry(timestamp);

    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      started_at INTEGER NOT NULL,
      ended_at INTEGER NOT NULL,
      start_lat REAL NOT NULL,
      start_lng REAL NOT NULL,
      end_lat REAL NOT NULL,
      end_lng REAL NOT NULL,
      distance_miles REAL NOT NULL,
      energy_used_kwh REAL NOT NULL,
      avg_speed_mph REAL NOT NULL,
      max_speed_mph REAL NOT NULL,
      efficiency_wh_per_mile REAL NOT NULL,
      start_battery REAL NOT NULL,
      end_battery REAL NOT NULL,
      ai_summary TEXT,
      ai_efficiency_score REAL,
      ai_highlights TEXT,
      ai_tip TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_trips_started ON trips(started_at);

    CREATE TABLE IF NOT EXISTS anomalies (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      message TEXT NOT NULL,
      data TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      ai_explanation TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_anomalies_timestamp ON anomalies(timestamp);

    CREATE TABLE IF NOT EXISTS geocode_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lat_bucket REAL NOT NULL,
      lng_bucket REAL NOT NULL,
      road_name TEXT,
      road_type TEXT,
      city TEXT,
      fetched_at INTEGER NOT NULL,
      UNIQUE(lat_bucket, lng_bucket)
    );

    CREATE INDEX IF NOT EXISTS idx_geocode_bucket ON geocode_cache(lat_bucket, lng_bucket);

    CREATE TABLE IF NOT EXISTS trip_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id TEXT NOT NULL,
      segment_order INTEGER NOT NULL,
      road_name TEXT,
      road_type TEXT,
      start_lat REAL,
      start_lng REAL,
      end_lat REAL,
      end_lng REAL,
      avg_heading REAL,
      heading_bucket TEXT,
      distance_miles REAL NOT NULL,
      duration_sec REAL NOT NULL,
      avg_speed_mph REAL NOT NULL,
      avg_power_kw REAL NOT NULL,
      energy_kwh REAL NOT NULL,
      wh_per_mile REAL NOT NULL,
      point_count INTEGER NOT NULL,
      polyline_json TEXT,
      FOREIGN KEY (trip_id) REFERENCES trips(id)
    );

    CREATE INDEX IF NOT EXISTS idx_trip_segments_trip ON trip_segments(trip_id);
    CREATE INDEX IF NOT EXISTS idx_trip_segments_road ON trip_segments(road_name);

    CREATE TABLE IF NOT EXISTS efficiency_hotspots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      road_name TEXT NOT NULL,
      heading_bucket TEXT NOT NULL,
      trip_count INTEGER NOT NULL,
      avg_wh_per_mile REAL NOT NULL,
      worst_wh_per_mile REAL NOT NULL,
      best_wh_per_mile REAL NOT NULL,
      avg_speed_mph REAL NOT NULL,
      last_updated INTEGER NOT NULL,
      is_hotspot BOOLEAN NOT NULL DEFAULT 0,
      UNIQUE(road_name, heading_bucket)
    );

    CREATE INDEX IF NOT EXISTS idx_hotspots_road ON efficiency_hotspots(road_name);
  `);
}

// ─── Telemetry ────────────────────────────────────────────────────────

const insertTelemetryStmt = () =>
  getDb().prepare(`
    INSERT INTO telemetry (
      timestamp, speed, power, battery_level, battery_range,
      latitude, longitude, heading, inside_temp, outside_temp,
      shift_state, charging_state, charge_rate, charger_power, odometer
    ) VALUES (
      @timestamp, @speed, @power, @battery_level, @battery_range,
      @latitude, @longitude, @heading, @inside_temp, @outside_temp,
      @shift_state, @charging_state, @charge_rate, @charger_power, @odometer
    )
  `);

export function saveTelemetry(point: TelemetryPoint) {
  insertTelemetryStmt().run(point);
}

export function getTelemetryRange(
  startTs: number,
  endTs: number
): TelemetryPoint[] {
  return getDb()
    .prepare("SELECT * FROM telemetry WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp")
    .all(startTs, endTs) as TelemetryPoint[];
}

export function getRecentTelemetry(minutes: number): TelemetryPoint[] {
  const since = Date.now() - minutes * 60 * 1000;
  return getDb()
    .prepare("SELECT * FROM telemetry WHERE timestamp >= ? ORDER BY timestamp")
    .all(since) as TelemetryPoint[];
}

// ─── Trips ────────────────────────────────────────────────────────────

export function saveTrip(trip: Trip) {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO trips (
        id, started_at, ended_at, start_lat, start_lng, end_lat, end_lng,
        distance_miles, energy_used_kwh, avg_speed_mph, max_speed_mph,
        efficiency_wh_per_mile, start_battery, end_battery,
        ai_summary, ai_efficiency_score, ai_highlights, ai_tip
      ) VALUES (
        @id, @started_at, @ended_at, @start_lat, @start_lng, @end_lat, @end_lng,
        @distance_miles, @energy_used_kwh, @avg_speed_mph, @max_speed_mph,
        @efficiency_wh_per_mile, @start_battery, @end_battery,
        @ai_summary, @ai_efficiency_score, @ai_highlights, @ai_tip
      )`
    )
    .run(trip);
}

export function getTrips(limit = 20): Trip[] {
  return getDb()
    .prepare("SELECT * FROM trips ORDER BY started_at DESC LIMIT ?")
    .all(limit) as Trip[];
}

export function updateTripAI(
  tripId: string,
  ai: { summary: string; score: number; highlights: string; tip: string }
) {
  getDb()
    .prepare(
      `UPDATE trips SET
        ai_summary = @summary,
        ai_efficiency_score = @score,
        ai_highlights = @highlights,
        ai_tip = @tip
      WHERE id = @tripId`
    )
    .run({ tripId, ...ai });
}

/**
 * Scan telemetry DB for driving sessions that weren't saved as trips.
 * This handles the case where the server restarts mid-drive and misses
 * the D→P transition. Call on server startup after hydration.
 */
export function reconstructMissedTrips(): number {
  const d = getDb();

  // Get all telemetry with real odometer (exclude mock data with odo > 10000)
  const allPoints = d
    .prepare(
      `SELECT * FROM telemetry
       WHERE odometer > 1 AND odometer < 10000
       ORDER BY timestamp ASC`
    )
    .all() as TelemetryPoint[];

  if (allPoints.length < 4) return 0;

  // Get existing trip timestamps to avoid duplicates
  const existingTrips = d
    .prepare("SELECT started_at FROM trips")
    .all() as Array<{ started_at: number }>;
  const existingStarts = new Set(existingTrips.map((t) => t.started_at));

  // Group consecutive driving points into trips (gap > 5 min = new trip)
  const GAP_MS = 5 * 60 * 1000;
  const trips: TelemetryPoint[][] = [];
  let current: TelemetryPoint[] = [];

  for (const p of allPoints) {
    const driving = p.shift_state === "D" || p.shift_state === "R";
    if (driving) {
      if (current.length > 0 && p.timestamp - current[current.length - 1].timestamp > GAP_MS) {
        trips.push(current);
        current = [];
      }
      current.push(p);
    } else if (current.length > 0) {
      // Add the first non-driving point as trip end
      current.push(p);
      trips.push(current);
      current = [];
    }
  }
  if (current.length > 0) trips.push(current);

  let saved = 0;
  for (const trip of trips) {
    if (trip.length < 4) continue;

    const first = trip[0];
    const last = trip[trip.length - 1];

    // Skip if this trip already exists
    if (existingStarts.has(first.timestamp)) continue;

    const dist = Math.abs(last.odometer - first.odometer);
    const dur = (last.timestamp - first.timestamp) / 60000;

    // Sanity checks
    if (dist < 0.1 || dist > 500 || dur < 1) continue;

    const battUsed = first.battery_level - last.battery_level;
    const energyKwh = (battUsed / 100) * 75;
    const whPerMile = dist > 0 ? (energyKwh * 1000) / dist : 0;
    const speeds = trip.filter((p) => p.speed && p.speed > 0).map((p) => p.speed!);
    const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
    const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;

    const tripId = `trip-${first.timestamp}`;

    d.prepare(
      `INSERT OR IGNORE INTO trips (
        id, started_at, ended_at, start_lat, start_lng, end_lat, end_lng,
        distance_miles, energy_used_kwh, avg_speed_mph, max_speed_mph,
        efficiency_wh_per_mile, start_battery, end_battery,
        ai_summary, ai_efficiency_score, ai_highlights, ai_tip
      ) VALUES (
        @id, @started_at, @ended_at, @start_lat, @start_lng, @end_lat, @end_lng,
        @distance_miles, @energy_used_kwh, @avg_speed_mph, @max_speed_mph,
        @efficiency_wh_per_mile, @start_battery, @end_battery,
        NULL, NULL, NULL, NULL
      )`
    ).run({
      id: tripId,
      started_at: first.timestamp,
      ended_at: last.timestamp,
      start_lat: first.latitude,
      start_lng: first.longitude,
      end_lat: last.latitude,
      end_lng: last.longitude,
      distance_miles: dist,
      energy_used_kwh: energyKwh,
      avg_speed_mph: avgSpeed,
      max_speed_mph: maxSpeed,
      efficiency_wh_per_mile: whPerMile,
      start_battery: first.battery_level,
      end_battery: last.battery_level,
    });

    saved++;
    console.log(
      `[TeslaPulse] Reconstructed trip: ${tripId} — ${dist.toFixed(1)} mi, ${dur.toFixed(0)} min, ${first.battery_level}%→${last.battery_level}%`
    );
  }

  if (saved > 0) {
    console.log(`[TeslaPulse] Reconstructed ${saved} missed trip(s) from telemetry DB`);
  }

  return saved;
}

// ─── Anomalies ────────────────────────────────────────────────────────

export function saveAnomaly(anomaly: Anomaly) {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO anomalies (id, type, severity, message, data, timestamp, ai_explanation)
       VALUES (@id, @type, @severity, @message, @data, @timestamp, @ai_explanation)`
    )
    .run({ ...anomaly, data: JSON.stringify(anomaly.data) });
}

export function getRecentAnomalies(limit = 10): Anomaly[] {
  const rows = getDb()
    .prepare("SELECT * FROM anomalies ORDER BY timestamp DESC LIMIT ?")
    .all(limit) as Array<Anomaly & { data: string }>;

  return rows.map((r) => ({ ...r, data: JSON.parse(r.data) }));
}

// ─── Geocode Cache ───────────────────────────────────────────────────

export function getCachedRoadName(latBucket: number, lngBucket: number): { road_name: string; road_type: string; city: string } | null {
  return getDb()
    .prepare("SELECT road_name, road_type, city FROM geocode_cache WHERE lat_bucket = ? AND lng_bucket = ?")
    .get(latBucket, lngBucket) as { road_name: string; road_type: string; city: string } | undefined ?? null;
}

export function cacheRoadName(latBucket: number, lngBucket: number, roadName: string | null, roadType: string | null, city: string | null) {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO geocode_cache (lat_bucket, lng_bucket, road_name, road_type, city, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(latBucket, lngBucket, roadName, roadType, city, Date.now());
}

// ─── Trip Segments ───────────────────────────────────────────────────

import type { TripSegment, EfficiencyHotspot } from "@/types/tesla";

export function saveTripSegments(tripId: string, segments: TripSegment[]) {
  const d = getDb();
  const stmt = d.prepare(
    `INSERT INTO trip_segments (
      trip_id, segment_order, road_name, road_type,
      start_lat, start_lng, end_lat, end_lng,
      avg_heading, heading_bucket, distance_miles, duration_sec,
      avg_speed_mph, avg_power_kw, energy_kwh, wh_per_mile,
      point_count, polyline_json
    ) VALUES (
      @trip_id, @segment_order, @road_name, @road_type,
      @start_lat, @start_lng, @end_lat, @end_lng,
      @avg_heading, @heading_bucket, @distance_miles, @duration_sec,
      @avg_speed_mph, @avg_power_kw, @energy_kwh, @wh_per_mile,
      @point_count, @polyline_json
    )`
  );

  const insertMany = d.transaction((segs: TripSegment[]) => {
    for (const s of segs) stmt.run(s);
  });

  insertMany(segments);
}

export function getTripSegments(tripId: string): TripSegment[] {
  return getDb()
    .prepare("SELECT * FROM trip_segments WHERE trip_id = ? ORDER BY segment_order")
    .all(tripId) as TripSegment[];
}

export function getTripsWithSegments(limit = 20): Array<Trip & { segments: TripSegment[] }> {
  const trips = getTrips(limit);
  return trips.map((t) => ({
    ...t,
    segments: getTripSegments(t.id),
  }));
}

export function tripHasSegments(tripId: string): boolean {
  const row = getDb()
    .prepare("SELECT COUNT(*) as c FROM trip_segments WHERE trip_id = ?")
    .get(tripId) as { c: number };
  return row.c > 0;
}

// ─── Efficiency Hotspots ─────────────────────────────────────────────

export function upsertHotspot(h: EfficiencyHotspot) {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO efficiency_hotspots (
        road_name, heading_bucket, trip_count,
        avg_wh_per_mile, worst_wh_per_mile, best_wh_per_mile,
        avg_speed_mph, last_updated, is_hotspot
      ) VALUES (
        @road_name, @heading_bucket, @trip_count,
        @avg_wh_per_mile, @worst_wh_per_mile, @best_wh_per_mile,
        @avg_speed_mph, @last_updated, @is_hotspot
      )`
    )
    .run(h);
}

export function getHotspots(limit = 10): EfficiencyHotspot[] {
  return getDb()
    .prepare("SELECT * FROM efficiency_hotspots WHERE is_hotspot = 1 ORDER BY avg_wh_per_mile DESC LIMIT ?")
    .all(limit) as EfficiencyHotspot[];
}

export function getAllHotspots(limit = 20): EfficiencyHotspot[] {
  return getDb()
    .prepare("SELECT * FROM efficiency_hotspots ORDER BY avg_wh_per_mile DESC LIMIT ?")
    .all(limit) as EfficiencyHotspot[];
}

export function getSegmentStatsByRoad(): Array<{
  road_name: string;
  heading_bucket: string;
  trip_count: number;
  avg_wh: number;
  worst_wh: number;
  best_wh: number;
  avg_speed: number;
}> {
  return getDb()
    .prepare(
      `SELECT
        road_name, heading_bucket,
        COUNT(DISTINCT trip_id) as trip_count,
        AVG(wh_per_mile) as avg_wh,
        MAX(wh_per_mile) as worst_wh,
        MIN(wh_per_mile) as best_wh,
        AVG(avg_speed_mph) as avg_speed
      FROM trip_segments
      WHERE road_name IS NOT NULL AND road_name != 'Unknown Road'
      GROUP BY road_name, heading_bucket
      HAVING COUNT(DISTINCT trip_id) >= 2
      ORDER BY avg_wh DESC`
    )
    .all() as Array<{
    road_name: string;
    heading_bucket: string;
    trip_count: number;
    avg_wh: number;
    worst_wh: number;
    best_wh: number;
    avg_speed: number;
  }>;
}
