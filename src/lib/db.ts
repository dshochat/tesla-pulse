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
