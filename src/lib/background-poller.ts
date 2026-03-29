import { getSettings } from "./settings";
import { telemetryStore, vehicleDataToTelemetry, determineDashboardMode } from "./telemetry-store";
import { detectAnomalies } from "./anomaly-detector";
import { saveTelemetry, saveAnomaly, getRecentTelemetry } from "./db";

const POLL_INTERVAL = 60_000; // 60s flat
const BROWSER_TIMEOUT = 120_000; // 2 min without browser poll = disconnected

let poller: ReturnType<typeof setInterval> | null = null;
let lastBrowserPoll = 0;
let _status: "active" | "paused" | "disabled" = "disabled";

/** Called by vehicle-data route on every browser poll */
export function notifyBrowserPoll() {
  lastBrowserPoll = Date.now();
}

/** Is a browser actively polling? */
export function isBrowserConnected(): boolean {
  return Date.now() - lastBrowserPoll < BROWSER_TIMEOUT;
}

export function getPollerStatus(): "active" | "paused" | "disabled" {
  return _status;
}

/** Start the background poller if enabled in settings */
export function startBackgroundPoller() {
  const settings = getSettings();
  if (!settings.background_polling) {
    _status = "disabled";
    return;
  }
  if (poller) return; // already running

  console.log("[TeslaPulse] Background poller started (60s interval)");

  // Hydrate buffer from DB if needed
  if (!telemetryStore.hydrated) {
    try {
      const stored = getRecentTelemetry(30);
      telemetryStore.hydrate(stored);
    } catch { /* ok */ }
  }

  poller = setInterval(async () => {
    // Pause if browser is connected
    if (isBrowserConnected()) {
      _status = "paused";
      return;
    }

    _status = "active";
    const settings = getSettings();
    if (!settings.background_polling) {
      stopBackgroundPoller();
      return;
    }

    try {
      // Dynamic import to avoid circular deps
      const { getAccessToken } = await import("./tesla-auth");
      const token = await getAccessToken();

      const FLEET_API_BASE = "https://fleet-api.prd.eu.vn.cloud.tesla.com";

      // Check if vehicle is online (don't wake it)
      const listRes = await fetch(`${FLEET_API_BASE}/api/1/vehicles`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!listRes.ok) return;
      const listData = await listRes.json();
      const vehicles = listData.response || [];
      if (vehicles.length === 0) return;

      const vehicle = vehicles[0];
      if (vehicle.state !== "online") {
        console.log(`[TeslaPulse] Background poll: car is ${vehicle.state}, skipping`);
        return;
      }

      const vid = vehicle.id_s || String(vehicle.id);

      // Fetch each data category individually (combined endpoint is unreliable)
      const categories = ["charge_state", "climate_state", "drive_state", "vehicle_state", "vehicle_config"];
      let merged: Record<string, unknown> = {};

      const results = await Promise.allSettled(
        categories.map(async (ep) => {
          const res = await fetch(
            `${FLEET_API_BASE}/api/1/vehicles/${vid}/vehicle_data?endpoints=${ep}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (!res.ok) return null;
          const data = await res.json();
          return data.response;
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled" && r.value) {
          merged = { ...merged, ...r.value };
        }
      }

      // Convert and store
      if (!merged.charge_state && !merged.drive_state) return; // no useful data

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vehicleData = merged as any;
      const telemetryPoint = vehicleDataToTelemetry(vehicleData);
      telemetryStore.push(telemetryPoint);

      try { saveTelemetry(telemetryPoint); } catch { /* ok */ }

      // Anomaly detection
      const recentHistory = telemetryStore.getRecent(60);
      const anomalies = detectAnomalies(telemetryPoint, recentHistory);
      for (const a of anomalies) {
        try { saveAnomaly(a); } catch { /* ok */ }
      }

      const mode = determineDashboardMode(vehicleData);
      console.log(`[TeslaPulse] Background poll: mode=${mode}, battery=${telemetryPoint.battery_level.toFixed(0)}%, buffer=${telemetryStore.size}`);
    } catch (err) {
      console.log(`[TeslaPulse] Background poll error: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }, POLL_INTERVAL);

  _status = "active";
}

export function stopBackgroundPoller() {
  if (poller) {
    clearInterval(poller);
    poller = null;
    console.log("[TeslaPulse] Background poller stopped");
  }
  _status = "disabled";
}

/** Restart poller (call after settings change) */
export function restartBackgroundPoller() {
  stopBackgroundPoller();
  startBackgroundPoller();
}
