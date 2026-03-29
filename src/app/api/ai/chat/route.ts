import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/llm/provider";
import { telemetryStore } from "@/lib/telemetry-store";
import { isDemoModeFromSettings as isDemoMode } from "@/lib/settings";

const demoResponses: Record<string, string> = {
  battery:
    "Battery is at 72% with 198.5 miles of estimated range. At your current efficiency of 260 Wh/mi, that's about 3.5 hours of mixed driving. Overnight charging to 80% would take ~4 hours on your Level 2 charger.",
  efficiency:
    "Your recent trip averaged 260 Wh/mi — about 4% above the Model 3 EPA estimate of 250 Wh/mi. Highway portions hit 245 Wh/mi, but the city driving with frequent stops pushed the average up. Your best trip this week was 232 Wh/mi.",
  trip:
    "Last trip: 5.2 miles in 25 min, avg 38 mph, max 68 mph. Used 6% battery (78% → 72%). Efficiency score: 72/100. Highlights: smooth highway merge at 85 kW, recovered 0.8 kWh on the exit ramp via regen.",
  charge:
    "Last charging session: 45% → 80% in ~45 minutes at a Level 2 charger. Peak rate was 48 kW, tapering to 22 kW above 70%. Total energy added: 26.25 kWh. Cost estimate: ~$3.40 at $0.13/kWh.",
  anomaly:
    "One anomaly detected: vampire drain at 2.3%/hr while parked (normal is 0.5-1%). Sentry Mode was active — each camera draws continuous power. Disabling Sentry in trusted locations would save ~8% battery overnight.",
  climate:
    "Climate system is running at 1.8 kW with cabin at 22.5°C (target: 21°C). Outside temp is 18.3°C. The auto-conditioning is doing a good job — minimal energy waste. Pre-conditioning while plugged in saves range.",
  tire:
    "Tire pressures are within normal range. All four tires showing consistent readings. Recommended: 42 PSI for highway, 40 PSI for city driving comfort. Check monthly for best efficiency.",
  range:
    "Current range: 198.5 miles (estimated). Based on your driving patterns this week, real-world range is closer to 185 miles. Highway driving at 70+ mph reduces this by ~15%. City driving is closer to 210 miles.",
  default:
    "Midnight Storm is looking great! Currently at 72% battery with 198 miles range. Driving efficiency is solid at 260 Wh/mi. No critical anomalies — just the Sentry Mode vampire drain to watch. What else would you like to know?",
};

function getDemoReply(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("battery") || lower.includes("percent") || lower.includes("%")) return demoResponses.battery;
  if (lower.includes("efficien") || lower.includes("wh/mi") || lower.includes("consumption")) return demoResponses.efficiency;
  if (lower.includes("trip") || lower.includes("drive") || lower.includes("last")) return demoResponses.trip;
  if (lower.includes("charg") || lower.includes("supercharg") || lower.includes("plug")) return demoResponses.charge;
  if (lower.includes("anomal") || lower.includes("warn") || lower.includes("issue") || lower.includes("problem")) return demoResponses.anomaly;
  if (lower.includes("climate") || lower.includes("temp") || lower.includes("heat") || lower.includes("cool") || lower.includes("ac")) return demoResponses.climate;
  if (lower.includes("tire") || lower.includes("pressure") || lower.includes("psi")) return demoResponses.tire;
  if (lower.includes("range") || lower.includes("miles") || lower.includes("far")) return demoResponses.range;
  return demoResponses.default;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, demo } = body as {
      messages: { role: "user" | "assistant"; content: string }[];
      demo?: boolean;
    };

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: "Messages required" }, { status: 400 });
    }

    if (demo || isDemoMode()) {
      const lastMsg = messages[messages.length - 1].content;
      // Small delay to feel natural
      await new Promise((r) => setTimeout(r, 600 + Math.random() * 800));
      return NextResponse.json({ reply: getDemoReply(lastMsg) });
    }

    // Build vehicle context
    const recent = telemetryStore.getRecent(5);
    const latest = telemetryStore.latest;
    let context = "No telemetry data available yet.";

    if (latest) {
      context = `Current state: speed ${latest.speed ?? 0} mph, power ${latest.power.toFixed(1)} kW, battery ${latest.battery_level.toFixed(0)}%, range ${latest.battery_range.toFixed(0)} mi, ${latest.shift_state ? "driving" : "parked"}, charging: ${latest.charging_state}, temps: ${latest.inside_temp.toFixed(1)}°C inside / ${latest.outside_temp.toFixed(1)}°C outside. Buffer has ${recent.length} recent points.`;
    }

    const provider = getProvider();
    const reply = await provider.chat(messages, { contextString: context });
    return NextResponse.json({ reply });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat failed" },
      { status: 500 }
    );
  }
}
