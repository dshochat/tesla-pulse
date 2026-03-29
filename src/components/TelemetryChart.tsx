"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { TelemetryPoint } from "@/types/tesla";

interface TelemetryChartProps {
  data: TelemetryPoint[];
  className?: string;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function SparkChart({
  data,
  dataKey,
  color,
  label,
  unit,
  domain,
  formatter,
}: {
  data: { timestamp: number; value: number }[];
  dataKey: string;
  color: string;
  label: string;
  unit: string;
  domain?: [number, number];
  formatter?: (v: number) => string;
}) {
  const latest = data.length > 0 ? data[data.length - 1].value : 0;
  const fmt = formatter ?? ((v: number) => v.toFixed(1));

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">
          {label}
        </span>
        <span className="font-mono-telemetry text-sm font-semibold" style={{ color }}>
          {fmt(latest)} {unit}
        </span>
      </div>
      <div className="h-24">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <defs>
              <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1e1e2e" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="timestamp" hide />
            <YAxis hide domain={domain ?? ["auto", "auto"]} />
            <Tooltip
              contentStyle={{
                background: "#12121a",
                border: "1px solid #1e1e2e",
                borderRadius: 8,
                fontSize: 12,
                color: "#e8e8ed",
              }}
              labelFormatter={(ts) => formatTime(Number(ts))}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any) => [`${fmt(Number(v))} ${unit}`, label]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill={`url(#grad-${dataKey})`}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function TelemetryChart({ data, className }: TelemetryChartProps) {
  const speedData = data.map((p) => ({ timestamp: p.timestamp, value: p.speed ?? 0 }));
  const powerData = data.map((p) => ({ timestamp: p.timestamp, value: p.power }));
  const batteryData = data.map((p) => ({ timestamp: p.timestamp, value: p.battery_level }));

  return (
    <div className={`grid grid-cols-1 gap-3 lg:grid-cols-3 ${className ?? ""}`}>
      <SparkChart
        data={speedData}
        dataKey="speed"
        color="#00d4ff"
        label="Speed"
        unit="mph"
        domain={[0, "auto"] as unknown as [number, number]}
        formatter={(v) => v.toFixed(0)}
      />
      <SparkChart
        data={powerData}
        dataKey="power"
        color="#ff6b35"
        label="Power"
        unit="kW"
        formatter={(v) => v.toFixed(1)}
      />
      <SparkChart
        data={batteryData}
        dataKey="battery"
        color="#00ff88"
        label="Battery"
        unit="%"
        domain={[0, 100]}
        formatter={(v) => v.toFixed(1)}
      />
    </div>
  );
}
