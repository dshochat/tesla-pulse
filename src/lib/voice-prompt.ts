import { telemetryStore } from "./telemetry-store";
import { buildHistoryContext } from "./history-context";
import { getCurrentRoadName } from "./route-segments";
import { buildHotspotContext, isHotspot } from "./route-patterns";

export function buildVoiceSystemPrompt(): string {
  const recent = telemetryStore.getRecent(10);
  const latest = telemetryStore.latest;
  const trip = telemetryStore.getCurrentTrip();

  // Calculate session stats — only from points with consistent odometer (same real car)
  let sessionDuration = 0;
  let sessionDistance = 0;
  let sessionEfficiency = 0;

  if (trip.length >= 2) {
    const latestOdo = trip[trip.length - 1].odometer;
    const validTrip = trip.filter(p => Math.abs(p.odometer - latestOdo) < 500);
    if (validTrip.length >= 2) {
      sessionDuration = (validTrip[validTrip.length - 1].timestamp - validTrip[0].timestamp) / 60000;
      sessionDistance = Math.abs(validTrip[validTrip.length - 1].odometer - validTrip[0].odometer);
      const batteryUsed = validTrip[0].battery_level - validTrip[validTrip.length - 1].battery_level;
      const energyKwh = (batteryUsed / 100) * 75;
      if (sessionDistance > 0.1 && sessionDistance < 500) {
        sessionEfficiency = Math.round((energyKwh * 1000) / sessionDistance);
      }
    }
  }

  // Calculate recent efficiency
  let recentEfficiency = 0;
  if (recent.length >= 2) {
    const first = recent[0];
    const last = recent[recent.length - 1];
    const dist = Math.abs(last.odometer - first.odometer);
    if (dist > 0.1 && dist < 500) {
      const battUsed = first.battery_level - last.battery_level;
      const energy = (battUsed / 100) * 75;
      recentEfficiency = Math.round((energy * 1000) / dist);
    }
  }

  const speed = latest?.speed ?? 0;
  const power = latest?.power ?? 0;
  const battery = latest?.battery_level ?? 0;
  const range = latest?.battery_range ?? 0;
  const insideTemp = latest?.inside_temp ?? 0;
  const outsideTemp = latest?.outside_temp ?? 0;
  const charging = latest?.charging_state ?? "Unknown";
  const shift = latest?.shift_state ?? "P";
  const lat = latest?.latitude ?? 0;
  const lng = latest?.longitude ?? 0;
  const odometer = latest?.odometer ?? 0;

  // Get historical context from DB
  let historyCtx = "";
  try {
    historyCtx = buildHistoryContext();
  } catch {
    historyCtx = "DRIVING HISTORY: Unavailable";
  }

  // Location-aware context
  let locationCtx = "";
  try {
    if (lat && lng) {
      const roadName = getCurrentRoadName(lat, lng);
      locationCtx = `\nCURRENT ROAD: ${roadName}`;
      const hotspot = isHotspot(roadName);
      if (hotspot) {
        locationCtx += ` (HOTSPOT: avg ${hotspot.avg_wh_per_mile} Wh/mi over ${hotspot.trip_count} trips)`;
      }
    }
    const hotspotCtx = buildHotspotContext();
    if (hotspotCtx) locationCtx += "\n" + hotspotCtx;
  } catch { /* non-critical */ }

  return `You are Pulse, the AI voice co-pilot for a Tesla vehicle. You have access to real-time telemetry and full driving history. Be concise — the driver is driving. Keep responses under 3 sentences unless asked for detail.

CURRENT VEHICLE STATE:
- Speed: ${speed} mph
- Power: ${power.toFixed(1)} kW
- Battery: ${battery}% (${range.toFixed(0)} mi range)
- Efficiency: ${recentEfficiency || "N/A"} Wh/mi (last 10 min)
- Climate: Cabin ${insideTemp.toFixed(1)}°C, Outside ${outsideTemp.toFixed(1)}°C
- Charging: ${charging}
- Drive mode: ${shift || "Parked"}
- Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}
- Odometer: ${odometer.toFixed(1)} mi

CURRENT SESSION:
- Duration: ${sessionDuration.toFixed(0)} min
- Distance: ${sessionDistance.toFixed(1)} mi
- Session efficiency: ${sessionEfficiency || "N/A"} Wh/mi

${historyCtx}
${locationCtx}

PERSONALITY:
- You're like a calm, knowledgeable co-pilot
- Reference specific numbers from the telemetry and history when relevant
- If asked about efficiency, compare to EPA estimates (~260 Wh/mi for Model 3/Y)
- If asked about trips, charging, or battery health, use the historical data above
- If you detect concerning data (low battery, unusual power draw), mention it
- Use driver-friendly language, not technical jargon
- Keep it brief — the driver needs to focus on the road`;
}
