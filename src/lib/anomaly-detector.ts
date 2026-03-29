import type { TelemetryPoint, Anomaly } from "@/types/tesla";

const TIRE_PRESSURE_DELTA_THRESHOLD = 3; // PSI
const VAMPIRE_DRAIN_THRESHOLD = 2; // %/hr
const POWER_SPIKE_THRESHOLD = 150; // kW
const TEMP_OUTLIER_THRESHOLD = 20; // °C difference inside vs outside

export function detectAnomalies(
  current: TelemetryPoint,
  history: TelemetryPoint[]
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  // Power spike detection
  if (Math.abs(current.power) > POWER_SPIKE_THRESHOLD) {
    anomalies.push({
      id: `power-${current.timestamp}`,
      type: "power_spike",
      severity: Math.abs(current.power) > 200 ? "critical" : "warning",
      message: `Unusual power ${current.power > 0 ? "draw" : "regen"}: ${Math.abs(current.power).toFixed(0)} kW`,
      data: { power: current.power, speed: current.speed ?? 0 },
      timestamp: current.timestamp,
    });
  }

  // Temperature outlier (inside temp wildly different from outside)
  const tempDiff = Math.abs(current.inside_temp - current.outside_temp);
  if (
    tempDiff > TEMP_OUTLIER_THRESHOLD &&
    current.inside_temp > 50 // likely a sensor issue if inside > 50°C
  ) {
    anomalies.push({
      id: `temp-${current.timestamp}`,
      type: "temp_outlier",
      severity: "warning",
      message: `Cabin temp unusually high: ${current.inside_temp.toFixed(1)}°C (outside: ${current.outside_temp.toFixed(1)}°C)`,
      data: {
        inside_temp: current.inside_temp,
        outside_temp: current.outside_temp,
        difference: tempDiff,
      },
      timestamp: current.timestamp,
    });
  }

  // Vampire drain detection (parked, not charging, battery dropping)
  if (
    !current.shift_state &&
    current.charging_state === "Disconnected" &&
    history.length >= 12 // need at least 1 hour of data at 5-min intervals
  ) {
    const oneHourAgo = history.find(
      (p) => p.timestamp >= current.timestamp - 3600_000
    );
    if (oneHourAgo) {
      const drainPerHour =
        ((oneHourAgo.battery_level - current.battery_level) /
          ((current.timestamp - oneHourAgo.timestamp) / 3600_000));

      if (drainPerHour > VAMPIRE_DRAIN_THRESHOLD) {
        anomalies.push({
          id: `drain-${current.timestamp}`,
          type: "vampire_drain",
          severity: drainPerHour > 4 ? "critical" : "warning",
          message: `Battery draining ${drainPerHour.toFixed(1)}%/hr while parked`,
          data: {
            drain_rate: drainPerHour,
            battery_level: current.battery_level,
            hours_monitored: (current.timestamp - oneHourAgo.timestamp) / 3600_000,
          },
          timestamp: current.timestamp,
        });
      }
    }
  }

  return anomalies;
}

// Tire pressure anomalies need separate data not in standard telemetry
export function detectTirePressureAnomalies(pressures: {
  front_left: number;
  front_right: number;
  rear_left: number;
  rear_right: number;
}): Anomaly | null {
  const values = Object.values(pressures);
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (max - min > TIRE_PRESSURE_DELTA_THRESHOLD) {
    const entries = Object.entries(pressures);
    const low = entries.reduce((a, b) => (a[1] < b[1] ? a : b));
    const high = entries.reduce((a, b) => (a[1] > b[1] ? a : b));

    return {
      id: `tire-${Date.now()}`,
      type: "tire_pressure",
      severity: max - min > 5 ? "critical" : "warning",
      message: `Tire pressure delta: ${low[0].replace("_", " ")} at ${low[1]} PSI vs ${high[0].replace("_", " ")} at ${high[1]} PSI`,
      data: pressures,
      timestamp: Date.now(),
    };
  }

  return null;
}
