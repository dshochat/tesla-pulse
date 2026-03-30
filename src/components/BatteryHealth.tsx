"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { BatteryHealthSummary } from "@/types/tesla";

function HealthGauge({ health }: { health: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress = (health / 100) * circumference;
  const color =
    health >= 90 ? "#00ff88" : health >= 80 ? "#ffaa00" : "#ff4466";

  return (
    <div className="relative h-32 w-32">
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke="#1a1a2e"
          strokeWidth="8"
        />
        <motion.circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - progress }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-mono-telemetry text-2xl font-bold"
          style={{ color }}
        >
          {health.toFixed(1)}%
        </span>
        <span className="text-[10px] text-text-secondary">Health</span>
      </div>
    </div>
  );
}

function ChargerIcon({ type }: { type: string }) {
  switch (type) {
    case "supercharger":
      return <span title="Supercharger">⚡</span>;
    case "home":
      return <span title="Home">🏠</span>;
    case "destination":
      return <span title="Destination">📍</span>;
    default:
      return <span title="Other">🔌</span>;
  }
}

export default function BatteryHealth({ demoMode = false }: { demoMode?: boolean }) {
  const [data, setData] = useState<BatteryHealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [xAxis, setXAxis] = useState<"time" | "miles">("time");
  const [showAllSessions, setShowAllSessions] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (demoMode) params.set("demo", "true");
    fetch(`/api/battery-health?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [demoMode]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-bg-card p-6">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <span className="text-xs text-text-secondary">Loading battery health...</span>
        </div>
      </div>
    );
  }

  if (!data || data.totalSessions === 0) {
    return (
      <div className="rounded-xl border border-border bg-bg-card p-6">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-text-secondary">
          Battery Health
        </h3>
        <p className="text-xs text-text-secondary">
          No charge sessions recorded yet. Battery health data will appear after your first charge.
        </p>
      </div>
    );
  }

  // Merge both health datasets by month
  const monthMap = new Map<string, { date: string; miles: number; extrapolated?: number; sameLevel?: number }>();

  // Extrapolated (to 100%) data
  for (const h of data.healthHistory) {
    const key = h.timestamp.slice(0, 7);
    const existing = monthMap.get(key) || { date: key, miles: Math.round(h.odometer) };
    existing.extrapolated = h.estimated_health_pct;
    existing.miles = Math.round(h.odometer);
    monthMap.set(key, existing);
  }

  // Same-level comparison data
  for (const s of (data.sameLevelHistory || [])) {
    const existing = monthMap.get(s.month) || { date: s.month, miles: s.odometer_avg };
    existing.sameLevel = s.health_pct;
    if (!existing.miles) existing.miles = s.odometer_avg;
    monthMap.set(s.month, existing);
  }

  const chartData = Array.from(monthMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Average Tesla degradation reference
  const refLineData = chartData.map((d) => ({
    ...d,
    avgHealth: 100 - (d.miles / 1000) * 0.075,
  }));

  const sessions = showAllSessions
    ? data.recentSessions
    : data.recentSessions.slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Health Score + Stats */}
      <div className="rounded-xl border border-border bg-bg-card p-6">
        <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-text-secondary">
          Battery Health
        </h3>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[auto_1fr]">
          {/* Health gauge — same-level is default, fall back to extrapolated */}
          <div className="flex flex-col items-center gap-2">
            <HealthGauge health={data.sameLevelHealth ?? data.currentHealth ?? 0} />
            <div className="text-center">
              <p className="text-[10px] text-text-secondary">
                {data.odometer?.toLocaleString() ?? "—"} mi •{" "}
                {data.vehicleAge ?? "—"} months
              </p>
              <p className="text-[10px] text-text-secondary">
                {data.totalSessions} charge sessions
              </p>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="Total Energy" value={`${data.totalEnergyKwh.toLocaleString()} kWh`} />
            <StatCard label="Avg Charge Rate" value={`${data.avgChargeRate} kW`} />
            <StatCard
              label="Supercharger Use"
              value={`${data.superchargerPct}%`}
              accent={data.superchargerPct > 50 ? "#ffaa00" : undefined}
            />
            <StatCard label="Avg Charge Level" value={`${data.avgChargeLevel}%`} />
            <StatCard label="Sessions/Week" value={`${data.sessionsPerWeek}`} />
            <StatCard
              label="Degradation"
              value={`${data.degradation?.toFixed(1) ?? "—"}%`}
              accent={
                (data.degradation ?? 0) > 10
                  ? "#ff4466"
                  : (data.degradation ?? 0) > 5
                  ? "#ffaa00"
                  : "#00ff88"
              }
            />
          </div>
        </div>
      </div>

      {/* Degradation Chart */}
      <div className="rounded-xl border border-border bg-bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wider text-text-secondary">
            Degradation Trend
          </h3>
          <div className="flex items-center gap-1 rounded-lg bg-bg-hover p-0.5">
            <button
              onClick={() => setXAxis("time")}
              className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition-all ${
                xAxis === "time"
                  ? "bg-accent/20 text-accent"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Time
            </button>
            <button
              onClick={() => setXAxis("miles")}
              className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition-all ${
                xAxis === "miles"
                  ? "bg-accent/20 text-accent"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Miles
            </button>
          </div>
        </div>

        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={refLineData} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e" />
              <XAxis
                dataKey={xAxis === "time" ? "date" : "miles"}
                tick={{ fontSize: 10, fill: "#6b6b80" }}
                axisLine={{ stroke: "#1a1a2e" }}
                tickFormatter={xAxis === "miles" ? (v) => `${(v / 1000).toFixed(0)}k` : undefined}
              />
              <YAxis
                domain={[88, 101]}
                tick={{ fontSize: 10, fill: "#6b6b80" }}
                axisLine={{ stroke: "#1a1a2e" }}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#12121f",
                  border: "1px solid #1e1e32",
                  borderRadius: "8px",
                  fontSize: "11px",
                }}
                labelStyle={{ color: "#6b6b80" }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={((value: any, name: any) => [
                  `${Number(value).toFixed(1)}%`,
                  name === "sameLevel" ? "Same-Level (default)" :
                  name === "extrapolated" ? "Extrapolated to 100%" : "Average Tesla",
                ]) as any}
              />
              <ReferenceLine y={100} stroke="#1a1a2e" strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="avgHealth"
                stroke="#6b6b80"
                strokeDasharray="5 5"
                strokeWidth={1}
                dot={false}
                name="avgHealth"
              />
              <Line
                type="monotone"
                dataKey="sameLevel"
                stroke="#00d4ff"
                strokeWidth={2}
                dot={{ fill: "#00d4ff", r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5, fill: "#00d4ff" }}
                name="sameLevel"
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="extrapolated"
                stroke="#00ff88"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                dot={{ fill: "#00ff88", r: 2, strokeWidth: 0 }}
                activeDot={{ r: 4, fill: "#00ff88" }}
                name="extrapolated"
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-text-secondary">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-accent" /> Same-Level (default)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-positive" style={{ opacity: 0.7 }} /> Extrapolated to 100%
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 border-t border-dashed border-text-secondary" />{" "}
            Average Tesla
          </span>
        </div>
      </div>

      {/* AI Insight */}
      {data.latestInsight && (
        <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-medium text-accent">🔋 AI Battery Insight</span>
            <span className="text-[10px] text-text-secondary">
              {new Date(data.latestInsight.timestamp).toLocaleDateString()}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-text-primary">
            {data.latestInsight.insight}
          </p>
        </div>
      )}

      {/* Charge Session History */}
      <div className="rounded-xl border border-border bg-bg-card p-6">
        <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-text-secondary">
          Recent Charge Sessions
        </h3>

        <div className="space-y-2">
          {sessions.map((s, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border border-border bg-bg-hover/50 px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">
                  <ChargerIcon type={s.charger_type} />
                </span>
                <div>
                  <p className="text-xs font-medium text-text-primary">
                    {s.battery_level_start}% → {s.battery_level_end}%
                  </p>
                  <p className="text-[10px] text-text-secondary">
                    {new Date(s.timestamp).toLocaleDateString()} •{" "}
                    {s.duration_minutes} min
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono-telemetry text-xs text-text-primary">
                  +{s.energy_added.toFixed(1)} kWh
                </p>
                <p className="text-[10px] text-text-secondary">
                  {s.charge_rate_avg} kW avg
                </p>
              </div>
            </div>
          ))}
        </div>

        {data.recentSessions.length > 5 && (
          <button
            onClick={() => setShowAllSessions(!showAllSessions)}
            className="mt-3 w-full rounded-lg border border-border py-2 text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            {showAllSessions ? "Show Less" : `Show All ${data.recentSessions.length} Sessions`}
          </button>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-hover/50 p-3">
      <p className="text-[10px] text-text-secondary">{label}</p>
      <p
        className="font-mono-telemetry text-sm font-medium"
        style={{ color: accent || "#e0e0f0" }}
      >
        {value}
      </p>
    </div>
  );
}
