import { NextResponse } from "next/server";
import { getProvider, buildTelemetryContext } from "@/lib/llm/provider";
import { telemetryStore } from "@/lib/telemetry-store";
import { mockCoachTips } from "@/lib/mock-data";
import { isDemoModeFromSettings as isDemoMode } from "@/lib/settings";

export async function GET() {
  try {
    if (isDemoMode()) {
      const tip = mockCoachTips[Math.floor(Math.random() * mockCoachTips.length)];
      return NextResponse.json({ tip: tip.tip, timestamp: Date.now() });
    }

    const recent = telemetryStore.getRecent(1);
    if (recent.length === 0) {
      return NextResponse.json({
        tip: "Start driving to receive efficiency coaching.",
        timestamp: Date.now(),
      });
    }

    const ctx = buildTelemetryContext(recent);
    const provider = getProvider();
    const tip = await provider.generateCoachTip(ctx);
    return NextResponse.json({ tip, timestamp: Date.now() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Coach failed" },
      { status: 500 }
    );
  }
}
