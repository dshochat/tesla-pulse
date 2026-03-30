import Database from "better-sqlite3";
import path from "path";
import type {
  ChargeSession,
  BatteryHealthSnapshot,
  BatteryInsight,
  BatteryHealthSummary,
  SameLevelHealth,
  TeslaVehicleData,
} from "@/types/tesla";

const DB_PATH = path.join(process.cwd(), "teslapulse.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = normal");
  }
  initBatterySchema();
  return db;
}

let schemaInit = false;
function initBatterySchema() {
  if (schemaInit) return;
  const d = db!;

  d.exec(`
    CREATE TABLE IF NOT EXISTS charge_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      battery_level_start INTEGER,
      battery_level_end INTEGER,
      range_at_end REAL,
      energy_added REAL,
      charge_rate_avg REAL,
      charge_rate_max REAL,
      charger_type TEXT,
      charger_voltage REAL,
      charger_current REAL,
      duration_minutes INTEGER,
      odometer REAL,
      outside_temp REAL,
      battery_heater_on BOOLEAN
    );

    CREATE INDEX IF NOT EXISTS idx_charge_sessions_ts ON charge_sessions(timestamp);

    CREATE TABLE IF NOT EXISTS battery_health (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      odometer REAL,
      max_range_at_100 REAL,
      battery_level INTEGER,
      measured_range REAL,
      estimated_health_pct REAL,
      degradation_pct REAL,
      original_epa_range REAL
    );

    CREATE INDEX IF NOT EXISTS idx_battery_health_ts ON battery_health(timestamp);

    CREATE TABLE IF NOT EXISTS battery_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      insight TEXT NOT NULL,
      session_count INTEGER NOT NULL
    );
  `);

  schemaInit = true;
}

// ─── EPA Range Lookup ────────────────────────────────────────────────

const EPA_RANGES: Record<string, number> = {
  // Model 3
  "model3": 272,
  "model3_lr": 358,
  "model3_performance": 315,
  // Model Y
  "modely": 330,
  "modely_lr": 330,
  "modely_performance": 303,
  // Model S
  "models": 405,
  "models_lr": 405,
  // Model X
  "modelx": 348,
  "modelx_lr": 348,
};

export function getEpaRange(carType?: string, trimBadging?: string): number {
  if (!carType) return 330; // default Model Y LR

  const key = carType.toLowerCase().replace(/\s+/g, "");
  const trimKey = trimBadging ? `${key}_${trimBadging.toLowerCase()}` : key;

  return EPA_RANGES[trimKey] || EPA_RANGES[key] || 330;
}

// ─── Charger Type Detection ──────────────────────────────────────────

export function detectChargerType(
  chargerPower: number,
  fastChargerPresent?: boolean
): ChargeSession["charger_type"] {
  if (fastChargerPresent && chargerPower > 50) return "supercharger";
  if (chargerPower > 50) return "supercharger";
  if (chargerPower >= 5) return "destination";
  if (chargerPower > 0) return "home";
  return "other";
}

// ─── Charge Session Tracking ─────────────────────────────────────────

interface ChargingSessionTracker {
  active: boolean;
  startTime: number;
  startLevel: number;
  chargeRates: number[];
  maxRate: number;
  lastVehicleData: TeslaVehicleData | null;
}

const tracker: ChargingSessionTracker = {
  active: false,
  startTime: 0,
  startLevel: 0,
  chargeRates: [],
  maxRate: 0,
  lastVehicleData: null,
};

/**
 * Call this on every vehicle data poll. Detects charge session start/end
 * and saves completed sessions to the database.
 */
export function trackCharging(vehicleData: TeslaVehicleData): ChargeSession | null {
  const cs = vehicleData.charge_state;
  if (!cs) return null;

  const isCharging = cs.charging_state === "Charging";
  const wasCharging = tracker.active;

  if (isCharging && !wasCharging) {
    // Session started
    tracker.active = true;
    tracker.startTime = Date.now();
    tracker.startLevel = cs.battery_level;
    tracker.chargeRates = [];
    tracker.maxRate = 0;
  }

  if (isCharging) {
    // Accumulate rates
    if (cs.charger_power > 0) {
      tracker.chargeRates.push(cs.charger_power);
      if (cs.charger_power > tracker.maxRate) {
        tracker.maxRate = cs.charger_power;
      }
    }
    tracker.lastVehicleData = vehicleData;
  }

  if (wasCharging && !isCharging) {
    // Session ended
    tracker.active = false;

    const vd = tracker.lastVehicleData || vehicleData;
    const endCs = vd.charge_state;
    const duration = Math.round((Date.now() - tracker.startTime) / 60000);
    const avgRate =
      tracker.chargeRates.length > 0
        ? tracker.chargeRates.reduce((a, b) => a + b, 0) / tracker.chargeRates.length
        : 0;

    const session: ChargeSession = {
      timestamp: new Date().toISOString(),
      battery_level_start: tracker.startLevel,
      battery_level_end: endCs.battery_level,
      range_at_end: endCs.battery_range,
      energy_added: endCs.charge_energy_added || 0,
      charge_rate_avg: Math.round(avgRate * 10) / 10,
      charge_rate_max: Math.round(tracker.maxRate * 10) / 10,
      charger_type: detectChargerType(tracker.maxRate, endCs.fast_charger_present),
      charger_voltage: endCs.charger_voltage || 0,
      charger_current: endCs.charger_actual_current || 0,
      duration_minutes: duration,
      odometer: vd.vehicle_state?.odometer || 0,
      outside_temp: vd.climate_state?.outside_temp || 0,
      battery_heater_on: !!endCs.battery_heater_on,
    };

    // Save to DB
    try {
      saveChargeSession(session);

      // Compute health snapshot if above 90% or any level (less accurate)
      computeHealthSnapshot(session, vd);

      // Check if we should run AI analysis (every 5th session)
      const count = getSessionCount();
      if (count > 0 && count % 5 === 0) {
        return session; // Signal to caller to run AI analysis
      }
    } catch (e) {
      console.error("[BatteryHealth] Failed to save session:", e);
    }

    return session;
  }

  return null;
}

// ─── Health Computation ──────────────────────────────────────────────

function computeHealthSnapshot(session: ChargeSession, vehicleData: TeslaVehicleData) {
  if (session.battery_level_end < 50) return; // too low for accurate extrapolation

  const batteryLevel = session.battery_level_end;
  const measuredRange = session.range_at_end;

  if (measuredRange <= 0 || batteryLevel <= 0) return;

  const maxRangeAt100 = (measuredRange / batteryLevel) * 100;
  const epaRange = getEpaRange(
    vehicleData.vehicle_config?.car_type,
    vehicleData.vehicle_config?.trim_badging
  );
  const healthPct = Math.min(100, (maxRangeAt100 / epaRange) * 100);
  const degradation = 100 - healthPct;

  const snapshot: BatteryHealthSnapshot = {
    timestamp: new Date().toISOString(),
    odometer: session.odometer,
    max_range_at_100: Math.round(maxRangeAt100 * 10) / 10,
    battery_level: batteryLevel,
    measured_range: measuredRange,
    estimated_health_pct: Math.round(healthPct * 10) / 10,
    degradation_pct: Math.round(degradation * 10) / 10,
    original_epa_range: epaRange,
  };

  try {
    saveHealthSnapshot(snapshot);
    console.log(
      `[BatteryHealth] Health snapshot: ${healthPct.toFixed(1)}% (${degradation.toFixed(1)}% degraded) at ${session.odometer.toFixed(0)} mi`
    );
  } catch (e) {
    console.error("[BatteryHealth] Failed to save health snapshot:", e);
  }
}

// ─── Database Operations ─────────────────────────────────────────────

export function saveChargeSession(session: ChargeSession) {
  getDb()
    .prepare(
      `INSERT INTO charge_sessions (
        timestamp, battery_level_start, battery_level_end, range_at_end,
        energy_added, charge_rate_avg, charge_rate_max, charger_type,
        charger_voltage, charger_current, duration_minutes, odometer,
        outside_temp, battery_heater_on
      ) VALUES (
        @timestamp, @battery_level_start, @battery_level_end, @range_at_end,
        @energy_added, @charge_rate_avg, @charge_rate_max, @charger_type,
        @charger_voltage, @charger_current, @duration_minutes, @odometer,
        @outside_temp, @battery_heater_on
      )`
    )
    .run(session);
}

export function saveHealthSnapshot(snapshot: BatteryHealthSnapshot) {
  getDb()
    .prepare(
      `INSERT INTO battery_health (
        timestamp, odometer, max_range_at_100, battery_level,
        measured_range, estimated_health_pct, degradation_pct, original_epa_range
      ) VALUES (
        @timestamp, @odometer, @max_range_at_100, @battery_level,
        @measured_range, @estimated_health_pct, @degradation_pct, @original_epa_range
      )`
    )
    .run(snapshot);
}

export function saveBatteryInsight(insight: string, sessionCount: number) {
  getDb()
    .prepare(
      `INSERT INTO battery_insights (timestamp, insight, session_count)
       VALUES (@timestamp, @insight, @session_count)`
    )
    .run({
      timestamp: new Date().toISOString(),
      insight,
      session_count: sessionCount,
    });
}

export function getSessionCount(): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) as c FROM charge_sessions")
    .get() as { c: number };
  return row.c;
}

export function getRecentSessions(limit = 20): ChargeSession[] {
  return getDb()
    .prepare("SELECT * FROM charge_sessions ORDER BY timestamp DESC LIMIT ?")
    .all(limit) as ChargeSession[];
}

export function getHealthHistory(): BatteryHealthSnapshot[] {
  return getDb()
    .prepare("SELECT * FROM battery_health ORDER BY timestamp ASC")
    .all() as BatteryHealthSnapshot[];
}

export function getLatestHealth(): BatteryHealthSnapshot | null {
  return (
    (getDb()
      .prepare("SELECT * FROM battery_health ORDER BY timestamp DESC LIMIT 1")
      .get() as BatteryHealthSnapshot) || null
  );
}

export function getLatestInsight(): BatteryInsight | null {
  return (
    (getDb()
      .prepare("SELECT * FROM battery_insights ORDER BY timestamp DESC LIMIT 1")
      .get() as BatteryInsight) || null
  );
}

export function getChargingStats(): {
  totalEnergy: number;
  avgRate: number;
  superchargerCount: number;
  totalCount: number;
  avgEndLevel: number;
  highChargeCount: number;
  lowChargeCount: number;
  firstSessionDate: string | null;
} {
  const d = getDb();
  const stats = d
    .prepare(
      `SELECT
        COALESCE(SUM(energy_added), 0) as totalEnergy,
        COALESCE(AVG(charge_rate_avg), 0) as avgRate,
        COALESCE(SUM(CASE WHEN charger_type = 'supercharger' THEN 1 ELSE 0 END), 0) as superchargerCount,
        COUNT(*) as totalCount,
        COALESCE(AVG(battery_level_end), 0) as avgEndLevel,
        COALESCE(SUM(CASE WHEN battery_level_end >= 90 THEN 1 ELSE 0 END), 0) as highChargeCount,
        COALESCE(SUM(CASE WHEN battery_level_start <= 20 THEN 1 ELSE 0 END), 0) as lowChargeCount,
        MIN(timestamp) as firstSessionDate
      FROM charge_sessions`
    )
    .get() as Record<string, number | string | null>;

  return {
    totalEnergy: stats.totalEnergy as number,
    avgRate: stats.avgRate as number,
    superchargerCount: stats.superchargerCount as number,
    totalCount: stats.totalCount as number,
    avgEndLevel: stats.avgEndLevel as number,
    highChargeCount: stats.highChargeCount as number,
    lowChargeCount: stats.lowChargeCount as number,
    firstSessionDate: stats.firstSessionDate as string | null,
  };
}

// ─── Same-Level Health Comparison ────────────────────────────────────

export function getSameLevelHistory(): SameLevelHealth[] {
  const rows = getDb()
    .prepare(
      `SELECT
        strftime('%Y-%m', timestamp) as month,
        AVG(range_at_end) as avg_range,
        AVG(battery_level_end) as avg_level,
        COUNT(*) as session_count,
        AVG(odometer) as odometer_avg
      FROM charge_sessions
      WHERE battery_level_end BETWEEN 75 AND 85
      GROUP BY strftime('%Y-%m', timestamp)
      ORDER BY month ASC`
    )
    .all() as Array<{
    month: string;
    avg_range: number;
    avg_level: number;
    session_count: number;
    odometer_avg: number;
  }>;

  if (rows.length === 0) return [];

  // Normalize to first month's reading = 100%
  // Adjust for level differences: range_per_pct = avg_range / avg_level
  const baseline = rows[0];
  const baselineRangePerPct = baseline.avg_range / baseline.avg_level;

  return rows.map((r) => {
    const rangePerPct = r.avg_range / r.avg_level;
    const healthPct = (rangePerPct / baselineRangePerPct) * 100;
    return {
      month: r.month,
      avg_range: Math.round(r.avg_range * 10) / 10,
      avg_level: Math.round(r.avg_level),
      session_count: r.session_count,
      odometer_avg: Math.round(r.odometer_avg),
      health_pct: Math.round(healthPct * 10) / 10,
    };
  });
}

// ─── Full Summary ────────────────────────────────────────────────────

export function getBatteryHealthSummary(): BatteryHealthSummary {
  const latest = getLatestHealth();
  const stats = getChargingStats();
  const healthHistory = getHealthHistory();
  const sameLevelHistory = getSameLevelHistory();
  const recentSessions = getRecentSessions(10);
  const latestInsight = getLatestInsight();

  // Vehicle age in months (from first session)
  let vehicleAge: number | null = null;
  if (stats.firstSessionDate) {
    const first = new Date(stats.firstSessionDate);
    vehicleAge = Math.round(
      (Date.now() - first.getTime()) / (1000 * 60 * 60 * 24 * 30)
    );
  }

  // Sessions per week
  let sessionsPerWeek = 0;
  if (stats.firstSessionDate && stats.totalCount > 0) {
    const weeks = Math.max(
      1,
      (Date.now() - new Date(stats.firstSessionDate).getTime()) /
        (1000 * 60 * 60 * 24 * 7)
    );
    sessionsPerWeek = Math.round((stats.totalCount / weeks) * 10) / 10;
  }

  // Same-level current health (latest month)
  const sameLevelCurrent = sameLevelHistory.length > 0
    ? sameLevelHistory[sameLevelHistory.length - 1].health_pct
    : null;
  const sameLevelDeg = sameLevelCurrent !== null ? Math.round((100 - sameLevelCurrent) * 10) / 10 : null;

  return {
    currentHealth: latest?.estimated_health_pct ?? null,
    degradation: latest?.degradation_pct ?? null,
    sameLevelHealth: sameLevelCurrent,
    sameLevelDegradation: sameLevelDeg,
    sameLevelHistory,
    totalSessions: stats.totalCount,
    totalEnergyKwh: Math.round(stats.totalEnergy * 10) / 10,
    avgChargeRate: Math.round(stats.avgRate * 10) / 10,
    superchargerPct:
      stats.totalCount > 0
        ? Math.round((stats.superchargerCount / stats.totalCount) * 100)
        : 0,
    avgChargeLevel: Math.round(stats.avgEndLevel),
    sessionsPerWeek,
    healthHistory,
    recentSessions,
    latestInsight,
    vehicleAge,
    odometer: latest?.odometer ?? null,
  };
}

// ─── AI Analysis Context Builder ─────────────────────────────────────

export function buildBatteryAnalysisContext(
  model: string,
  odometer: number,
  ageMonths: number
): string {
  const summary = getBatteryHealthSummary();
  const stats = getChargingStats();

  const sessionsStr = summary.recentSessions
    .map(
      (s) =>
        `${s.timestamp.slice(0, 10)}: ${s.battery_level_start}%→${s.battery_level_end}%, ${s.energy_added}kWh, ${s.charger_type}, ${s.charge_rate_avg}kW, ${s.duration_minutes}min, ${s.outside_temp}°C`
    )
    .join("\n");

  const healthStr = summary.healthHistory
    .slice(-6)
    .map((h) => `${h.timestamp.slice(0, 7)}: ${h.estimated_health_pct}%, ${h.odometer.toFixed(0)}mi`)
    .join("\n");

  return `VEHICLE: ${model} • ${odometer.toFixed(0)} miles • ${ageMonths} months old

CURRENT HEALTH: ${summary.currentHealth?.toFixed(1) ?? "Unknown"}% (${summary.degradation?.toFixed(1) ?? "Unknown"}% degraded)

RECENT CHARGE SESSIONS (last 10):
${sessionsStr || "No sessions recorded yet"}

HEALTH TREND (last 6 months):
${healthStr || "Not enough data yet"}

CHARGING HABITS:
- Average charge level: ${summary.avgChargeLevel}%
- Supercharger usage: ${summary.superchargerPct}% of sessions
- Average sessions per week: ${summary.sessionsPerWeek}
- Charges above 90%: ${stats.totalCount > 0 ? Math.round((stats.highChargeCount / stats.totalCount) * 100) : 0}% of sessions
- Charges below 20%: ${stats.totalCount > 0 ? Math.round((stats.lowChargeCount / stats.totalCount) * 100) : 0}% of sessions`;
}
