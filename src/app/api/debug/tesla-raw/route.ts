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

    // Fetch each category individually and merge (combined endpoint returns partial)
    const categories = ["charge_state", "climate_state", "drive_state", "vehicle_state", "vehicle_config"];
    const results: Record<string, unknown> = {};

    for (const ep of categories) {
      try {
        const res = await fetch(
          `${FLEET_API_BASE}/api/1/vehicles/${vid}/vehicle_data?endpoints=${ep}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.response?.[ep]) {
            results[ep] = "present (" + Object.keys(data.response[ep]).length + " keys)";
          } else {
            results[ep] = "200 but empty";
          }
          // Merge into a sample
          if (ep === "drive_state" && data.response?.drive_state) {
            const ds = data.response.drive_state;
            results.drive_state_sample = {
              speed: ds.speed,
              shift_state: ds.shift_state,
              power: ds.power,
              heading: ds.heading,
              latitude: ds.latitude,
              longitude: ds.longitude,
            };
          }
          if (ep === "climate_state" && data.response?.climate_state) {
            const cl = data.response.climate_state;
            results.climate_sample = {
              inside_temp: cl.inside_temp,
              outside_temp: cl.outside_temp,
              is_climate_on: cl.is_climate_on,
            };
          }
          if (ep === "vehicle_state" && data.response?.vehicle_state) {
            const vs = data.response.vehicle_state;
            results.vehicle_state_sample = {
              locked: vs.locked,
              odometer: vs.odometer,
              sentry_mode: vs.sentry_mode,
              car_version: vs.car_version,
            };
          }
        } else {
          results[ep] = `HTTP ${res.status}`;
        }
      } catch (err) {
        results[ep] = `error: ${err instanceof Error ? err.message : "unknown"}`;
      }
    }

    return NextResponse.json({
      vehicle_id: vid,
      vehicle_name: vehicles[0].display_name,
      state: vehicles[0].state,
      results,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
