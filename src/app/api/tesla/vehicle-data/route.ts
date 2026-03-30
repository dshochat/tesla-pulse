import { NextRequest, NextResponse } from "next/server";
import { getVehicleData } from "@/lib/tesla-api";
import { mockVehicleData, generateMockDrive, generateMockChargingSession } from "@/lib/mock-data";
import { isDemoModeFromSettings } from "@/lib/settings";
import { telemetryStore, vehicleDataToTelemetry, determineDashboardMode, getPollingInterval } from "@/lib/telemetry-store";
import { detectAnomalies } from "@/lib/anomaly-detector";
import { saveTelemetry, saveAnomaly, getRecentTelemetry, saveTrip, reconstructMissedTrips } from "@/lib/db";
import { getProvider, buildTripContext } from "@/lib/llm/provider";
import { notifyBrowserPoll, startBackgroundPoller } from "@/lib/background-poller";
import { startVoiceServer } from "@/lib/voice-server";
import { trackCharging, saveBatteryInsight, buildBatteryAnalysisContext, getBatteryHealthSummary } from "@/lib/battery-health";
import { analyzeTripsSegments, buildSegmentSummary } from "@/lib/route-segments";
import { updateHotspots } from "@/lib/route-patterns";

// Mock simulation state
let mockDrivePoints: ReturnType<typeof generateMockDrive> | null = null;
let mockChargePoints: ReturnType<typeof generateMockChargingSession> | null = null;
let mockDriveIndex = 0;
let mockChargeIndex = 0;
let currentScenario = "driving";

export async function GET(request: NextRequest) {
  const vehicleId = request.nextUrl.searchParams.get("id");
  const scenario = request.nextUrl.searchParams.get("scenario");

  // Allow scenario switching via query param
  if (scenario && scenario !== currentScenario) {
    currentScenario = scenario;
    telemetryStore.clear();
    // Reset indices when switching
    if (scenario === "driving") {
      mockDrivePoints = null;
      mockDriveIndex = 0;
    } else if (scenario === "charging") {
      mockChargePoints = null;
      mockChargeIndex = 0;
    }
  }

  try {
    let vehicleData;
    const demo = request.nextUrl.searchParams.get("demo") === "true" || isDemoModeFromSettings();

    // Track browser presence for background poller
    notifyBrowserPoll();
    // Ensure background poller is initialized (no-op if already running or disabled)
    startBackgroundPoller();
    // Ensure voice server is running (no-op if already started)
    try { startVoiceServer(); } catch { /* ok */ }

    if (demo) {
      if (currentScenario === "charging") {
        // Charging scenario
        if (!mockChargePoints) {
          mockChargePoints = generateMockChargingSession();
          mockChargeIndex = 0;
        }
        const point = mockChargePoints[mockChargeIndex % mockChargePoints.length];
        mockChargeIndex++;

        vehicleData = {
          ...mockVehicleData,
          drive_state: {
            ...mockVehicleData.drive_state,
            speed: null,
            power: point.power,
            latitude: point.latitude,
            longitude: point.longitude,
            heading: point.heading,
            shift_state: null,
            timestamp: Date.now(),
          },
          charge_state: {
            ...mockVehicleData.charge_state,
            battery_level: point.battery_level,
            battery_range: point.battery_range,
            charging_state: point.charging_state as "Disconnected" | "Charging" | "Complete" | "Stopped" | "NoPower",
            charge_rate: point.charge_rate,
            charger_power: point.charger_power,
            charge_energy_added: Math.min(26, mockChargeIndex * 0.05),
            time_to_full_charge: point.charger_power > 0 ? Math.max(0, (80 - point.battery_level) * 0.75 / point.charger_power) : 0,
            timestamp: Date.now(),
          },
          climate_state: {
            ...mockVehicleData.climate_state,
            inside_temp: point.inside_temp,
            outside_temp: point.outside_temp,
            is_climate_on: false,
            timestamp: Date.now(),
          },
          vehicle_state: {
            ...mockVehicleData.vehicle_state,
            odometer: point.odometer,
            timestamp: Date.now(),
          },
        };
      } else if (currentScenario === "parked") {
        // Parked scenario — static data
        vehicleData = {
          ...mockVehicleData,
          drive_state: {
            ...mockVehicleData.drive_state,
            speed: null,
            power: 0,
            shift_state: null,
            timestamp: Date.now(),
          },
          charge_state: {
            ...mockVehicleData.charge_state,
            battery_level: 72,
            battery_range: 198.5,
            charging_state: "Disconnected" as const,
            charge_rate: 0,
            charger_power: 0,
            timestamp: Date.now(),
          },
          climate_state: {
            ...mockVehicleData.climate_state,
            is_climate_on: false,
            is_auto_conditioning_on: false,
            timestamp: Date.now(),
          },
          vehicle_state: {
            ...mockVehicleData.vehicle_state,
            timestamp: Date.now(),
          },
        };
      } else {
        // Driving scenario (default)
        if (!mockDrivePoints) {
          mockDrivePoints = generateMockDrive();
          mockDriveIndex = 0;
        }

        const drivingPoints = mockDrivePoints.filter((p) => p.shift_state === "D" || p.shift_state === "R");
        const point = drivingPoints[mockDriveIndex % drivingPoints.length];
        mockDriveIndex++;

        vehicleData = {
          ...mockVehicleData,
          drive_state: {
            ...mockVehicleData.drive_state,
            speed: point.speed,
            power: point.power,
            latitude: point.latitude,
            longitude: point.longitude,
            heading: point.heading,
            shift_state: point.shift_state as "D" | "R" | "P" | "N" | null,
            timestamp: Date.now(),
          },
          charge_state: {
            ...mockVehicleData.charge_state,
            battery_level: point.battery_level,
            battery_range: point.battery_range,
            charging_state: point.charging_state as "Disconnected" | "Charging" | "Complete" | "Stopped" | "NoPower",
            charge_rate: point.charge_rate,
            charger_power: point.charger_power,
            timestamp: Date.now(),
          },
          climate_state: {
            ...mockVehicleData.climate_state,
            inside_temp: point.inside_temp,
            outside_temp: point.outside_temp,
            timestamp: Date.now(),
          },
          vehicle_state: {
            ...mockVehicleData.vehicle_state,
            odometer: point.odometer,
            timestamp: Date.now(),
          },
        };
      }
    } else {
      if (!vehicleId) {
        return NextResponse.json({ error: "Vehicle ID required" }, { status: 400 });
      }
      vehicleData = await getVehicleData(vehicleId);
    }

    // Hydrate ring buffer from SQLite on first request
    if (!telemetryStore.hydrated && !demo) {
      try {
        const stored = getRecentTelemetry(30);
        telemetryStore.hydrate(stored);
        // Reconstruct any trips missed during server restarts
        reconstructMissedTrips();
      } catch {
        // DB read failure is non-critical
      }
    }

    // Track previous driving state for trip detection
    const wasDriving = telemetryStore.isDriving;

    // Convert to telemetry and store
    const telemetryPoint = vehicleDataToTelemetry(vehicleData);
    telemetryStore.push(telemetryPoint);

    // Persist to SQLite
    try {
      saveTelemetry(telemetryPoint);
    } catch {
      // DB write failure is non-critical
    }

    // Track charge sessions (live mode only)
    if (!demo) {
      try {
        const sessionResult = trackCharging(vehicleData);
        if (sessionResult) {
          // Every 5th session triggers AI analysis
          const summary = getBatteryHealthSummary();
          const model = vehicleData.vehicle_config?.car_type || "Tesla";
          const odometer = vehicleData.vehicle_state?.odometer || 0;
          const age = summary.vehicleAge || 0;
          const ctx = buildBatteryAnalysisContext(model, odometer, age);

          getProvider()
            .chat(
              [{ role: "user" as const, content: ctx }],
              {
                contextString: `You are TeslaPulse Battery Analyst. Analyze this Tesla's battery health data and give 2-3 specific, actionable insights. Be concise.\n\nProvide:\n1. Overall assessment (one sentence)\n2. Whether degradation is above/below average for this model and mileage\n3. One specific charging habit recommendation to improve longevity`,
              }
            )
            .then((insight: string) => {
              saveBatteryInsight(insight, summary.totalSessions);
              console.log("[BatteryHealth] AI insight saved");
            })
            .catch(() => {});
        }
      } catch {
        // Battery tracking failure is non-critical
      }
    }

    // Detect trip end: was driving, now not
    const nowDriving = telemetryStore.isDriving;
    let tripSummary = null;
    if (wasDriving && !nowDriving && !demo) {
      const tripPoints = telemetryStore.getCurrentTrip();
      if (tripPoints.length >= 4 && tripPoints[0].odometer > 0) {
        try {
          const first = tripPoints[0];
          const last = tripPoints[tripPoints.length - 1];
          const ctx = buildTripContext(tripPoints);

          // Sanity check — skip garbage data from mock/live transitions
          if (ctx.distanceMiles < 0 || ctx.distanceMiles > 1000 || ctx.batteryStart <= 0 || ctx.durationMin < 1) {
            console.log(`[TeslaPulse] Trip discarded — bad data: ${ctx.distanceMiles.toFixed(1)} mi, ${ctx.durationMin.toFixed(0)} min`);
          } else {
          const tripId = `trip-${first.timestamp}`;

          // Save trip to DB
          const tripRecord = {
            id: tripId,
            started_at: first.timestamp,
            ended_at: last.timestamp,
            start_lat: first.latitude,
            start_lng: first.longitude,
            end_lat: last.latitude,
            end_lng: last.longitude,
            distance_miles: ctx.distanceMiles,
            energy_used_kwh: ctx.whPerMile * ctx.distanceMiles / 1000,
            avg_speed_mph: ctx.avgSpeed,
            max_speed_mph: ctx.maxSpeed,
            efficiency_wh_per_mile: ctx.whPerMile,
            start_battery: ctx.batteryStart,
            end_battery: ctx.batteryEnd,
            ai_summary: null,
            ai_efficiency_score: null,
            ai_highlights: null,
            ai_tip: null,
          };
          saveTrip(tripRecord);

          // Segment analysis → hotspot update → AI summary (chained, async)
          analyzeTripsSegments(tripId, tripPoints)
            .then(() => {
              try { updateHotspots(); } catch { /* non-critical */ }
              // Include segment data in AI summary
              const segSummary = buildSegmentSummary(tripId);
              const enrichedCtx = { ...ctx, summary: ctx.summary + (segSummary || "") };
              return getProvider().generateTripSummary(enrichedCtx);
            })
            .then((ai) => {
              try {
                const { updateTripAI } = require("@/lib/db");
                updateTripAI(tripId, {
                  summary: ai.summary,
                  score: ai.efficiency_score,
                  highlights: JSON.stringify(ai.highlights),
                  tip: ai.tip,
                });
                console.log(`[TeslaPulse] Trip ${tripId} AI summary + segments saved`);
              } catch { /* non-critical */ }
            })
            .catch((err) => {
              console.error(`[TeslaPulse] Trip analysis failed for ${tripId}:`, err instanceof Error ? err.message : err);
            });

          tripSummary = { tripId, distance: ctx.distanceMiles, duration: ctx.durationMin };
          console.log(`[TeslaPulse] Trip ended: ${ctx.distanceMiles.toFixed(1)} mi, ${ctx.durationMin.toFixed(0)} min`);
          } // end sanity check else
        } catch {
          // non-critical
        }
      }
    }

    // Check for anomalies
    const recentHistory = telemetryStore.getRecent(60);
    const anomalies = detectAnomalies(telemetryPoint, recentHistory);
    for (const a of anomalies) {
      try {
        saveAnomaly(a);
      } catch {
        // non-critical
      }
    }

    const mode = determineDashboardMode(vehicleData);
    const nextPoll = demo ? 2000 : getPollingInterval(mode);
    console.log(`[TeslaPulse] Poll: mode=${mode}, next=${nextPoll / 1000}s, buffer=${telemetryStore.size}`);

    return NextResponse.json({
      vehicleData,
      telemetry: telemetryPoint,
      recentTelemetry: telemetryStore.getRecent(30),
      mode,
      nextPollMs: nextPoll,
      anomalies,
      tripSummary,
      bufferSize: telemetryStore.size,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch vehicle data";
    let status = 500;
    let errorType = "generic";
    if (message.includes("408")) { status = 408; errorType = "asleep"; }
    else if (message.includes("429")) { status = 429; errorType = "rate_limited"; }
    else if (message.includes("403") || message.includes("blocked token refresh")) { status = 403; errorType = "token_expired"; }
    else if (message.includes("authenticate")) { errorType = "auth"; }
    return NextResponse.json({ error: message, status, errorType }, { status });
  }
}
