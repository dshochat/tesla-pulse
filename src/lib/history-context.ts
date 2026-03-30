import Database from "better-sqlite3";
import path from "path";
import type { Trip } from "@/types/tesla";

const DB_PATH = path.join(process.cwd(), "teslapulse.db");

function getDb(): Database.Database {
  return new Database(DB_PATH, { readonly: true });
}

interface PeriodStats {
  trips: number;
  miles: number;
  kwhUsed: number;
  avgWhPerMile: number;
}

function queryPeriodStats(db: Database.Database, sinceTs: number): PeriodStats {
  const row = db.prepare(`
    SELECT
      COUNT(*) as trips,
      COALESCE(SUM(distance_miles), 0) as miles,
      COALESCE(SUM(energy_used_kwh), 0) as kwh,
      CASE WHEN SUM(distance_miles) > 0
        THEN SUM(energy_used_kwh) * 1000 / SUM(distance_miles)
        ELSE 0
      END as wh_per_mile
    FROM trips WHERE started_at >= ?
  `).get(sinceTs) as { trips: number; miles: number; kwh: number; wh_per_mile: number };

  return {
    trips: row.trips,
    miles: Math.round(row.miles * 10) / 10,
    kwhUsed: Math.round(row.kwh * 10) / 10,
    avgWhPerMile: Math.round(row.wh_per_mile),
  };
}

function formatStats(label: string, s: PeriodStats): string {
  if (s.trips === 0) return `${label}: No trips`;
  return `${label}: ${s.trips} trips, ${s.miles} mi, ${s.avgWhPerMile} Wh/mi, ${s.kwhUsed} kWh`;
}

/**
 * Build a compact historical context string for AI system prompts.
 * Includes today, yesterday, this week, lifetime stats, charge sessions, and battery health.
 */
export function buildHistoryContext(): string {
  let db: Database.Database;
  try {
    db = getDb();
  } catch {
    return "DRIVING HISTORY: Database unavailable";
  }

  try {
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    // Period stats
    const today = queryPeriodStats(db, todayStart.getTime());
    const yesterday = queryPeriodStats(db, yesterdayStart.getTime());
    // Yesterday-only = yesterday minus today
    const yesterdayOnly: PeriodStats = {
      trips: yesterday.trips - today.trips,
      miles: Math.round((yesterday.miles - today.miles) * 10) / 10,
      kwhUsed: Math.round((yesterday.kwhUsed - today.kwhUsed) * 10) / 10,
      avgWhPerMile: 0,
    };
    if (yesterdayOnly.miles > 0) {
      yesterdayOnly.avgWhPerMile = Math.round((yesterdayOnly.kwhUsed * 1000) / yesterdayOnly.miles);
    }

    const week = queryPeriodStats(db, weekStart.getTime());

    // Lifetime
    const lifetime = db.prepare(`
      SELECT
        COUNT(*) as trips,
        COALESCE(SUM(distance_miles), 0) as miles,
        COALESCE(SUM(energy_used_kwh), 0) as kwh,
        CASE WHEN SUM(distance_miles) > 0
          THEN SUM(energy_used_kwh) * 1000 / SUM(distance_miles)
          ELSE 0
        END as wh_per_mile
      FROM trips
    `).get() as { trips: number; miles: number; kwh: number; wh_per_mile: number };

    // Recent trips (last 5)
    const recentTrips = db.prepare(
      "SELECT * FROM trips ORDER BY started_at DESC LIMIT 5"
    ).all() as Trip[];

    const tripLines = recentTrips.map((t) => {
      const d = new Date(t.started_at);
      const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      return `  ${dateStr} ${timeStr}: ${t.distance_miles.toFixed(1)} mi, ${Math.round(t.avg_speed_mph)} mph, ${Math.round(t.efficiency_wh_per_mile)} Wh/mi, ${Math.round(t.start_battery)}%→${Math.round(t.end_battery)}%`;
    });

    // Charge sessions (last 5)
    let chargeLines: string[] = [];
    try {
      const charges = db.prepare(
        "SELECT * FROM charge_sessions ORDER BY timestamp DESC LIMIT 5"
      ).all() as Array<{
        timestamp: string;
        energy_added: number;
        charger_type: string;
        battery_level_start: number;
        battery_level_end: number;
      }>;
      chargeLines = charges.map((c) => {
        const d = new Date(c.timestamp);
        const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        return `  ${dateStr}: +${c.energy_added.toFixed(1)} kWh, ${c.charger_type}, ${c.battery_level_start}%→${c.battery_level_end}%`;
      });
    } catch { /* no charge_sessions table yet */ }

    // Battery health
    let healthLine = "";
    try {
      const health = db.prepare(
        "SELECT * FROM battery_health ORDER BY timestamp DESC LIMIT 1"
      ).get() as { estimated_health_pct: number; degradation_pct: number } | undefined;
      const insight = db.prepare(
        "SELECT insight FROM battery_insights ORDER BY timestamp DESC LIMIT 1"
      ).get() as { insight: string } | undefined;

      if (health) {
        healthLine = `\nBATTERY HEALTH: ${health.estimated_health_pct.toFixed(1)}% (${health.degradation_pct.toFixed(1)}% degraded)`;
        if (insight) healthLine += `\n- Last insight: ${insight.insight.slice(0, 120)}`;
      }
    } catch { /* no battery tables yet */ }

    db.close();

    const sections = [
      "DRIVING HISTORY:",
      formatStats("Today", today),
      formatStats("Yesterday", yesterdayOnly),
      formatStats("This week", week),
      `Lifetime: ${lifetime.trips} trips, ${Math.round(lifetime.miles)} mi, ${Math.round(lifetime.wh_per_mile)} Wh/mi avg, ${Math.round(lifetime.kwh)} kWh total`,
      "",
      `RECENT TRIPS (last 5):`,
      ...(tripLines.length > 0 ? tripLines : ["  None recorded"]),
    ];

    if (chargeLines.length > 0) {
      sections.push("", "RECENT CHARGES (last 5):", ...chargeLines);
    }

    if (healthLine) {
      sections.push(healthLine);
    }

    // Efficiency hotspots
    try {
      const hotspots = db.prepare(
        "SELECT * FROM efficiency_hotspots WHERE is_hotspot = 1 ORDER BY avg_wh_per_mile DESC LIMIT 5"
      ).all() as Array<{ road_name: string; heading_bucket: string; avg_wh_per_mile: number; trip_count: number; worst_wh_per_mile: number }>;

      if (hotspots.length > 0) {
        sections.push("", "EFFICIENCY HOT SPOTS:");
        for (const h of hotspots) {
          sections.push(`- ${h.road_name} ${h.heading_bucket}: avg ${Math.round(h.avg_wh_per_mile)} Wh/mi (${h.trip_count} trips, worst: ${Math.round(h.worst_wh_per_mile)})`);
        }
      }
    } catch { /* no hotspots table yet */ }

    return sections.join("\n");
  } catch (e) {
    try { db.close(); } catch { /* */ }
    return "DRIVING HISTORY: Error loading data";
  }
}
