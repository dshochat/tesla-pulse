import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/tesla-auth";

const FLEET_API_BASE = "https://fleet-api.prd.eu.vn.cloud.tesla.com";

export async function GET() {
  try {
    const token = await getAccessToken();

    const listRes = await fetch(`${FLEET_API_BASE}/api/1/vehicles`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listData = await listRes.json();
    const vehicles = listData.response || [];
    if (vehicles.length === 0) {
      return NextResponse.json({ error: "No vehicles found" });
    }
    const vid = vehicles[0].id_s || String(vehicles[0].id);

    // Test 1: Combined endpoint (all at once)
    let combinedRaw: Record<string, unknown> = {};
    try {
      const res = await fetch(
        `${FLEET_API_BASE}/api/1/vehicles/${vid}/vehicle_data?endpoints=charge_state;climate_state;drive_state;vehicle_state`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      combinedRaw = await res.json();
    } catch (err) {
      combinedRaw = { error: String(err) };
    }

    // Extract the top-level keys and what's actually inside
    const response = (combinedRaw as Record<string, unknown>).response as Record<string, unknown> || {};
    const responseKeys = Object.keys(response);

    // Check if drive_state exists at response level
    const driveStateAtRoot = response.drive_state;
    // Check for speed/shift_state at response level (maybe Tesla flattens it)
    const speedAtRoot = response.speed;
    const shiftAtRoot = response.shift_state;

    // Test 2: drive_state alone
    let driveStateRaw: Record<string, unknown> = {};
    try {
      const res = await fetch(
        `${FLEET_API_BASE}/api/1/vehicles/${vid}/vehicle_data?endpoints=drive_state`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      driveStateRaw = await res.json();
    } catch (err) {
      driveStateRaw = { error: String(err) };
    }

    const driveResponse = (driveStateRaw as Record<string, unknown>).response as Record<string, unknown> || {};
    const driveResponseKeys = Object.keys(driveResponse);
    const driveStateNested = driveResponse.drive_state as Record<string, unknown> | undefined;

    // Test 3: location_data endpoint (newer API)
    let locationRaw: Record<string, unknown> = {};
    try {
      const res = await fetch(
        `${FLEET_API_BASE}/api/1/vehicles/${vid}/vehicle_data?endpoints=location_data`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      locationRaw = await res.json();
    } catch (err) {
      locationRaw = { error: String(err) };
    }

    return NextResponse.json({
      vehicle_id: vid,
      vehicle_state: vehicles[0].state,

      // Combined endpoint analysis
      combined_response_keys: responseKeys,
      combined_has_drive_state_key: !!driveStateAtRoot,
      combined_drive_state_value: driveStateAtRoot || null,
      combined_speed_at_root: speedAtRoot ?? "not present",
      combined_shift_state_at_root: shiftAtRoot ?? "not present",

      // drive_state-only endpoint analysis
      drive_only_response_keys: driveResponseKeys,
      drive_only_has_drive_state_nested: !!driveStateNested,
      drive_only_drive_state: driveStateNested || null,
      // Show ALL fields from the drive_state response at top level
      drive_only_response_sample: Object.fromEntries(
        driveResponseKeys.slice(0, 30).map(k => [k, driveResponse[k]])
      ),

      // location_data endpoint
      location_response: (locationRaw as Record<string, unknown>).response || locationRaw,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
