import type { TelemetryPoint, TeslaVehicleData, DashboardMode } from "@/types/tesla";

const MAX_POINTS = 120; // 30 min at 15s intervals

class TelemetryStore {
  private buffer: TelemetryPoint[] = [];
  private _currentTrip: TelemetryPoint[] = [];
  private _isDriving = false;
  private _hydrated = false;

  /** Load recent telemetry from SQLite on first access */
  hydrate(points: TelemetryPoint[]) {
    if (this._hydrated) return;
    this._hydrated = true;
    this.buffer = points.slice(-MAX_POINTS);
    // Reconstruct trip state from hydrated data
    for (const p of this.buffer) {
      const driving = p.shift_state === "D" || p.shift_state === "R";
      if (driving && !this._isDriving) {
        this._currentTrip = [p];
        this._isDriving = true;
      } else if (driving) {
        this._currentTrip.push(p);
      } else if (!driving && this._isDriving) {
        this._currentTrip.push(p);
        this._isDriving = false;
      }
    }
    console.log(`[TeslaPulse] Hydrated ${this.buffer.length} telemetry points from DB`);
  }

  get hydrated() { return this._hydrated; }

  push(point: TelemetryPoint) {
    this.buffer.push(point);
    if (this.buffer.length > MAX_POINTS) {
      this.buffer.shift();
    }

    // Track trip state
    const driving = point.shift_state === "D" || point.shift_state === "R";
    if (driving && !this._isDriving) {
      // Trip started
      this._currentTrip = [point];
      this._isDriving = true;
    } else if (driving && this._isDriving) {
      this._currentTrip.push(point);
    } else if (!driving && this._isDriving) {
      // Trip ended
      this._currentTrip.push(point);
      this._isDriving = false;
    }
  }

  getRecent(minutes: number): TelemetryPoint[] {
    const cutoff = Date.now() - minutes * 60 * 1000;
    return this.buffer.filter((p) => p.timestamp >= cutoff);
  }

  getLast(count: number): TelemetryPoint[] {
    return this.buffer.slice(-count);
  }

  getAll(): TelemetryPoint[] {
    return [...this.buffer];
  }

  getCurrentTrip(): TelemetryPoint[] {
    return [...this._currentTrip];
  }

  get isDriving(): boolean {
    return this._isDriving;
  }

  get latest(): TelemetryPoint | null {
    return this.buffer.length > 0 ? this.buffer[this.buffer.length - 1] : null;
  }

  get size(): number {
    return this.buffer.length;
  }

  clear() {
    this.buffer = [];
    this._currentTrip = [];
    this._isDriving = false;
  }
}

// Singleton
export const telemetryStore = new TelemetryStore();

// ─── Helpers ──────────────────────────────────────────────────────────

export function vehicleDataToTelemetry(data: TeslaVehicleData): TelemetryPoint {
  let lat = data.drive_state?.latitude ?? 0;
  let lng = data.drive_state?.longitude ?? 0;

  // If drive_state has valid coordinates, save as last known location
  if (lat !== 0 && lng !== 0) {
    try {
      const { getSettings, saveSettings, clearSettingsCache } = require("../lib/settings");
      const settings = getSettings();
      if (settings.last_known_lat !== lat || settings.last_known_lng !== lng) {
        settings.last_known_lat = lat;
        settings.last_known_lng = lng;
        saveSettings(settings);
        clearSettingsCache();
      }
    } catch { /* ok */ }
  } else {
    // Fall back to last known location
    try {
      const { getSettings } = require("../lib/settings");
      const settings = getSettings();
      if (settings.last_known_lat && settings.last_known_lng) {
        lat = settings.last_known_lat;
        lng = settings.last_known_lng;
      }
    } catch { /* ok */ }
  }

  return {
    timestamp: Date.now(),
    speed: data.drive_state?.speed ?? null,
    power: data.drive_state?.power ?? 0,
    battery_level: data.charge_state?.battery_level ?? 0,
    battery_range: data.charge_state?.battery_range ?? 0,
    latitude: lat,
    longitude: lng,
    heading: data.drive_state?.heading ?? 0,
    inside_temp: data.climate_state?.inside_temp ?? 0,
    outside_temp: data.climate_state?.outside_temp ?? 0,
    shift_state: data.drive_state?.shift_state ?? null,
    charging_state: data.charge_state?.charging_state ?? "Disconnected",
    charge_rate: data.charge_state?.charge_rate ?? 0,
    charger_power: data.charge_state?.charger_power ?? 0,
    odometer: data.vehicle_state?.odometer ?? 0,
  };
}

export function determineDashboardMode(data: TeslaVehicleData): DashboardMode {
  if (data.state === "asleep") return "asleep";
  if (data.state === "offline") return "offline";
  const shift = data.drive_state?.shift_state;
  if (shift === "D" || shift === "R") return "driving";
  if (data.charge_state?.charging_state === "Charging") return "charging";
  return "parked";
}

export function getPollingInterval(mode: DashboardMode): number {
  switch (mode) {
    case "driving":
      return 15_000; // 15s to stay within Tesla's $10/mo credit
    case "charging":
      return 60_000;
    case "parked":
      return 300_000;
    default:
      return 300_000;
  }
}
