"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { DashboardMode } from "@/types/tesla";

interface HeroMetricProps {
  mode: DashboardMode;
  speed: number | null;
  batteryLevel: number;
  batteryRange: number;
  power: number;
  chargerPower: number;
  chargeRate: number;
  timeToFull: number;
}

function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  return (
    <span className="inline-block tabular-nums">
      {value.toFixed(decimals)}
    </span>
  );
}

export default function HeroMetric({
  mode,
  speed,
  batteryLevel,
  batteryRange,
  power,
  chargerPower,
  chargeRate,
  timeToFull,
}: HeroMetricProps) {
  const isDriving = mode === "driving";
  const isCharging = mode === "charging";

  return (
    <div className="relative flex flex-col items-center justify-center py-6">
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute inset-0 rounded-3xl opacity-20 blur-3xl"
        style={{
          background: isDriving
            ? "radial-gradient(circle, #00d4ff 0%, transparent 70%)"
            : isCharging
              ? "radial-gradient(circle, #00ff88 0%, transparent 70%)"
              : "radial-gradient(circle, #00d4ff22 0%, transparent 70%)",
        }}
      />

      {/* Primary metric */}
      <div className="text-center">
        <div className="font-mono-telemetry text-8xl font-bold tracking-tight text-text-primary tabular-nums">
          {isDriving ? (
            <AnimatedNumber value={speed ?? 0} />
          ) : (
            <>
              <AnimatedNumber value={batteryLevel} />
              <span className="text-4xl text-text-secondary">%</span>
            </>
          )}
        </div>
        <div className="mt-1 text-sm font-medium uppercase tracking-widest text-text-secondary">
          {isDriving ? "mph" : isCharging ? "charging" : "battery"}
        </div>
      </div>

      {/* Secondary metrics row */}
      <div className="mt-6 flex items-center gap-8">
        {isDriving && (
          <>
            <MetricPill
              label="Power"
              value={`${power >= 0 ? "+" : ""}${power.toFixed(1)}`}
              unit="kW"
              color={power < 0 ? "#00ff88" : power > 50 ? "#ff4466" : "#00d4ff"}
            />
            <MetricPill
              label="Range"
              value={batteryRange.toFixed(0)}
              unit="mi"
              color="#00d4ff"
            />
            <MetricPill
              label="Battery"
              value={batteryLevel.toFixed(0)}
              unit="%"
              color={batteryLevel > 50 ? "#00ff88" : batteryLevel > 20 ? "#ffaa00" : "#ff4466"}
            />
          </>
        )}
        {isCharging && (
          <>
            <MetricPill
              label="Charger"
              value={chargerPower.toFixed(0)}
              unit="kW"
              color="#00ff88"
            />
            <MetricPill
              label="Rate"
              value={chargeRate.toFixed(0)}
              unit="mi/hr"
              color="#00ff88"
            />
            <MetricPill
              label="Full in"
              value={timeToFull > 0 ? (timeToFull * 60).toFixed(0) : "—"}
              unit="min"
              color="#00d4ff"
            />
          </>
        )}
        {!isDriving && !isCharging && (
          <>
            <MetricPill
              label="Range"
              value={batteryRange.toFixed(0)}
              unit="mi"
              color="#00d4ff"
            />
            <MetricPill
              label="Battery"
              value={batteryLevel.toFixed(0)}
              unit="%"
              color={batteryLevel > 50 ? "#00ff88" : batteryLevel > 20 ? "#ffaa00" : "#ff4466"}
            />
          </>
        )}
      </div>
    </div>
  );
}

function MetricPill({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string;
  unit: string;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] font-medium uppercase tracking-wider text-text-secondary">
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <span
          className="font-mono-telemetry text-2xl font-semibold"
          style={{ color }}
        >
          {value}
        </span>
        <span className="text-xs text-text-secondary">{unit}</span>
      </div>
    </div>
  );
}
