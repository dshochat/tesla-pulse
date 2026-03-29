import type { LLMProvider, ProviderName, TelemetryContext, TripContext } from "./types";
import type { TelemetryPoint } from "@/types/tesla";
import { getSettings } from "../settings";

let cachedProvider: LLMProvider | null = null;
let cachedProviderName: string | null = null;

/** Get the active LLM provider based on settings/env */
export function getProvider(): LLMProvider {
  const settings = getSettings();
  const name = (settings.llm_provider || process.env.LLM_PROVIDER || "grok") as ProviderName;

  // Return cached if same provider
  if (cachedProvider && cachedProviderName === name) {
    return cachedProvider;
  }

  switch (name) {
    case "grok": {
      const { grokProvider } = require("./grok");
      cachedProvider = grokProvider;
      break;
    }
    case "claude": {
      const { claudeProvider } = require("./claude");
      cachedProvider = claudeProvider;
      break;
    }
    case "openai": {
      const { openaiProvider } = require("./openai");
      cachedProvider = openaiProvider;
      break;
    }
    case "gemini": {
      const { geminiProvider } = require("./gemini");
      cachedProvider = geminiProvider;
      break;
    }
    default:
      throw new Error(`Unknown LLM provider: ${name}. Use: grok, claude, openai, or gemini`);
  }

  cachedProviderName = name;
  return cachedProvider!;
}

/** Get the active provider name */
export function getProviderName(): ProviderName {
  const settings = getSettings();
  return (settings.llm_provider || process.env.LLM_PROVIDER || "grok") as ProviderName;
}

/** Reset cached provider (call after settings change) */
export function resetProvider() {
  cachedProvider = null;
  cachedProviderName = null;
}

// ─── Helper: Build TelemetryContext from raw points ──────────────────

export function buildTelemetryContext(telemetry: TelemetryPoint[]): TelemetryContext {
  if (telemetry.length === 0) {
    return {
      avgSpeed: 0, avgPower: 0, batteryDrain: 0, maxPower: 0,
      minPower: 0, regenEvents: 0, totalPoints: 0,
      summary: "No telemetry data available.",
    };
  }

  const avgSpeed = telemetry.reduce((s, p) => s + (p.speed ?? 0), 0) / telemetry.length;
  const avgPower = telemetry.reduce((s, p) => s + p.power, 0) / telemetry.length;
  const batteryDrain = telemetry[0].battery_level - telemetry[telemetry.length - 1].battery_level;
  const maxPower = Math.max(...telemetry.map((p) => p.power));
  const minPower = Math.min(...telemetry.map((p) => p.power));
  const regenEvents = telemetry.filter((p) => p.power < -5).length;

  return {
    avgSpeed, avgPower, batteryDrain, maxPower, minPower,
    regenEvents, totalPoints: telemetry.length,
    summary: `Last 60s: avg speed ${avgSpeed.toFixed(0)} mph, avg power ${avgPower.toFixed(1)} kW, battery drain ${batteryDrain.toFixed(1)}%, peak power ${maxPower.toFixed(0)} kW, best regen ${minPower.toFixed(0)} kW, regen events: ${regenEvents}/${telemetry.length}`,
  };
}

// ─── Helper: Build TripContext from raw points ───────────────────────

export function buildTripContext(telemetry: TelemetryPoint[]): TripContext {
  const first = telemetry[0];
  const last = telemetry[telemetry.length - 1];
  const durationMin = (last.timestamp - first.timestamp) / 60_000;
  const distanceMiles = last.odometer - first.odometer;
  const batteryUsed = first.battery_level - last.battery_level;
  const avgSpeed = telemetry.reduce((s, p) => s + (p.speed ?? 0), 0) / telemetry.length;
  const maxSpeed = Math.max(...telemetry.map((p) => p.speed ?? 0));
  const avgPower = telemetry.reduce((s, p) => s + p.power, 0) / telemetry.length;
  const totalEnergy = telemetry.reduce((s, p) => s + Math.abs(p.power) * (5 / 3600), 0);
  const whPerMile = distanceMiles > 0 ? (totalEnergy * 1000) / distanceMiles : 0;

  return {
    durationMin, distanceMiles, batteryStart: first.battery_level,
    batteryEnd: last.battery_level, batteryUsed, avgSpeed, maxSpeed,
    avgPower, whPerMile,
    summary: `Trip: ${durationMin.toFixed(0)} min, ${distanceMiles.toFixed(1)} mi, battery ${first.battery_level.toFixed(0)}%→${last.battery_level.toFixed(0)}% (${batteryUsed.toFixed(1)}% used), avg speed ${avgSpeed.toFixed(0)} mph, max speed ${maxSpeed.toFixed(0)} mph, avg power ${avgPower.toFixed(1)} kW, ~${whPerMile.toFixed(0)} Wh/mi`,
  };
}
