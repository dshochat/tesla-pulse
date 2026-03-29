"use client";

import { motion } from "framer-motion";
import type { TeslaVehicleData } from "@/types/tesla";

interface VehicleStatusProps {
  data: TeslaVehicleData;
}

function StatusItem({
  label,
  value,
  active,
  color,
}: {
  label: string;
  value: string;
  active?: boolean;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-xs text-text-secondary">{label}</span>
      <span
        className="font-mono-telemetry text-xs font-medium"
        style={{ color: color ?? (active ? "#00ff88" : "#e8e8ed") }}
      >
        {value}
      </span>
    </div>
  );
}

export default function VehicleStatus({ data }: VehicleStatusProps) {
  const vs = data.vehicle_state;
  const cs = data.climate_state;
  const vc = data.vehicle_config;

  const windows = vs
    ? [vs.fd_window ?? 0, vs.fp_window ?? 0, vs.rd_window ?? 0, vs.rp_window ?? 0]
    : [0, 0, 0, 0];
  const allWindowsClosed = windows.every((w) => w === 0);

  const locked = vs?.locked ?? false;
  const sentryMode = vs?.sentry_mode ?? false;
  const climateOn = cs?.is_climate_on ?? false;
  const driverTemp = cs?.driver_temp_setting ?? 0;
  const insideTemp = cs?.inside_temp;
  const outsideTemp = cs?.outside_temp;
  const odometer = vs?.odometer;
  const carVersion = vs?.car_version ?? "";
  const carType = vc?.car_type ?? "";

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-text-secondary">
        Vehicle Status
      </h3>

      <div className="divide-y divide-border">
        <StatusItem
          label="Lock"
          value={vs ? (locked ? "Locked" : "Unlocked") : "—"}
          active={locked}
          color={vs ? (locked ? "#00ff88" : "#ff4466") : "#6b6b80"}
        />
        <StatusItem
          label="Sentry"
          value={vs ? (sentryMode ? "Active" : "Off") : "—"}
          active={sentryMode}
          color={sentryMode ? "#00d4ff" : "#6b6b80"}
        />
        <StatusItem
          label="Windows"
          value={vs ? (allWindowsClosed ? "All Closed" : "Open") : "—"}
          color={vs ? (allWindowsClosed ? "#00ff88" : "#ffaa00") : "#6b6b80"}
        />
        <StatusItem
          label="Climate"
          value={cs ? (climateOn ? `On · ${driverTemp}°C` : "Off") : "—"}
          active={climateOn}
        />
        {insideTemp != null && (
          <StatusItem
            label="Cabin"
            value={`${insideTemp.toFixed(1)}°C`}
          />
        )}
        {outsideTemp != null && (
          <StatusItem
            label="Outside"
            value={`${outsideTemp.toFixed(1)}°C`}
          />
        )}
        {odometer != null && (
          <StatusItem
            label="Odometer"
            value={`${odometer.toLocaleString(undefined, { maximumFractionDigits: 1 })} mi`}
          />
        )}
        {carVersion && (
          <StatusItem
            label="Software"
            value={carVersion.split(" ")[0]}
          />
        )}
      </div>

      {/* Vehicle name */}
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
        <motion.div
          className="h-1.5 w-1.5 rounded-full bg-positive"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 3, repeat: Infinity }}
        />
        <span className="text-xs font-medium text-text-primary">
          {data.display_name || vs?.vehicle_name || "Tesla"}
        </span>
        {carType && (
          <span className="text-[10px] text-text-secondary">
            {carType.replace("model", "Model ").toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}
