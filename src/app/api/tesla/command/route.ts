import { NextRequest, NextResponse } from "next/server";
import { sendCommand, wakeUp } from "@/lib/tesla-api";
import { isDemoModeFromSettings as isDemoMode } from "@/lib/settings";
import type { VehicleCommand } from "@/types/tesla";

const VALID_COMMANDS: VehicleCommand[] = [
  "honk_horn",
  "flash_lights",
  "door_lock",
  "door_unlock",
  "auto_conditioning_start",
  "auto_conditioning_stop",
  "set_temps",
];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { vehicleId, command, params } = body as {
      vehicleId: number;
      command: VehicleCommand;
      params?: Record<string, unknown>;
    };

    if (!vehicleId || !command) {
      return NextResponse.json(
        { error: "vehicleId and command are required" },
        { status: 400 }
      );
    }

    if (!VALID_COMMANDS.includes(command)) {
      return NextResponse.json(
        { error: `Invalid command. Valid: ${VALID_COMMANDS.join(", ")}` },
        { status: 400 }
      );
    }

    if (isDemoMode()) {
      // Simulate command execution
      await new Promise((r) => setTimeout(r, 500));
      return NextResponse.json({
        result: true,
        command,
        message: `[Demo] ${command} executed successfully`,
      });
    }

    // Wake vehicle first
    try {
      await wakeUp(vehicleId);
    } catch {
      return NextResponse.json(
        { error: "Could not wake vehicle. It may be offline." },
        { status: 503 }
      );
    }

    const result = await sendCommand(vehicleId, command, params);
    return NextResponse.json({ result: result.result, command });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Command failed" },
      { status: 500 }
    );
  }
}
