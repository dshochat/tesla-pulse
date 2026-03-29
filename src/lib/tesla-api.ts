import type {
  TeslaVehicle,
  TeslaVehicleData,
  CommandResult,
  VehicleCommand,
} from "@/types/tesla";
import { getAccessToken, refreshAccessToken } from "./tesla-auth";

const FLEET_API_BASE = "https://fleet-api.prd.eu.vn.cloud.tesla.com";

async function teslaFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAccessToken();

  let res = await fetch(`${FLEET_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  // Auto-refresh on 401
  if (res.status === 401) {
    const newTokens = await refreshAccessToken();
    res = await fetch(`${FLEET_API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${newTokens.access_token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  }

  if (!res.ok) {
    const text = await res.text();
    throw new TeslaApiError(res.status, text, path);
  }

  return res.json();
}

export class TeslaApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    public path: string
  ) {
    super(`Tesla API ${status} on ${path}: ${body}`);
    this.name = "TeslaApiError";
  }

  get isAsleep() {
    return this.status === 408;
  }

  get isRateLimited() {
    return this.status === 429;
  }

  get isOffline() {
    return this.status === 503 || this.status === 504;
  }
}

// ─── Vehicle List ─────────────────────────────────────────────────────

export async function listVehicles(): Promise<TeslaVehicle[]> {
  const data = await teslaFetch<{ response: TeslaVehicle[] }>(
    "/api/1/vehicles"
  );
  return data.response;
}

// ─── Vehicle Data ─────────────────────────────────────────────────────

export async function getVehicleData(
  vehicleId: number | string
): Promise<TeslaVehicleData> {
  // Tesla's combined endpoint sometimes returns only partial data.
  // Fetch each category individually in parallel and merge.
  const categories = [
    "charge_state",
    "climate_state",
    "drive_state",
    "vehicle_state",
    "vehicle_config",
  ];

  const results = await Promise.allSettled(
    categories.map((ep) =>
      teslaFetch<{ response: Record<string, unknown> }>(
        `/api/1/vehicles/${vehicleId}/vehicle_data?endpoints=${ep}`
      ).then((d) => ({ endpoint: ep, data: d.response }))
    )
  );

  // Start with the base vehicle info from any successful response
  let merged: Record<string, unknown> = {};
  for (const r of results) {
    if (r.status === "fulfilled") {
      merged = { ...merged, ...r.value.data };
    }
  }

  return merged as unknown as TeslaVehicleData;
}

// ─── Wake Up ──────────────────────────────────────────────────────────

export async function wakeUp(vehicleId: number | string): Promise<void> {
  const maxRetries = 5;
  const retryDelay = 3000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const data = await teslaFetch<{ response: { state: string } }>(
        `/api/1/vehicles/${vehicleId}/wake_up`,
        { method: "POST" }
      );
      if (data.response.state === "online") return;
    } catch (err) {
      if (i === maxRetries - 1) throw err;
    }
    await new Promise((r) => setTimeout(r, retryDelay));
  }

  throw new Error("Vehicle did not wake up after retries");
}

// ─── Commands ─────────────────────────────────────────────────────────

export async function sendCommand(
  vehicleId: number | string,
  command: VehicleCommand,
  body?: Record<string, unknown>
): Promise<CommandResult> {
  const data = await teslaFetch<{ response: CommandResult }>(
    `/api/1/vehicles/${vehicleId}/command/${command}`,
    {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }
  );
  return data.response;
}

// ─── Convenience Commands ─────────────────────────────────────────────

export const commands = {
  honk: (vid: number) => sendCommand(vid, "honk_horn"),
  flash: (vid: number) => sendCommand(vid, "flash_lights"),
  lock: (vid: number) => sendCommand(vid, "door_lock"),
  unlock: (vid: number) => sendCommand(vid, "door_unlock"),
  climateOn: (vid: number) => sendCommand(vid, "auto_conditioning_start"),
  climateOff: (vid: number) => sendCommand(vid, "auto_conditioning_stop"),
  setTemps: (vid: number, driverTemp: number, passengerTemp: number) =>
    sendCommand(vid, "set_temps", {
      driver_temp: driverTemp,
      passenger_temp: passengerTemp,
    }),
};
