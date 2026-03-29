import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";

const FLEET_AUTH_URL = "https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token";
const FLEET_API_BASE = "https://fleet-api.prd.eu.vn.cloud.tesla.com";

export async function POST() {
  try {
    const settings = getSettings();
    const clientId = settings.keys.tesla_client_id || process.env.TESLA_CLIENT_ID || "";
    const clientSecret = settings.keys.tesla_client_secret || process.env.TESLA_CLIENT_SECRET || "";

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: "Tesla Client ID and Secret are required. Configure them in Settings." },
        { status: 400 }
      );
    }

    // Step 1: Get a partner token via client_credentials grant
    const tokenRes = await fetch(FLEET_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "openid vehicle_device_data vehicle_cmds vehicle_charging_cmds",
        audience: FLEET_API_BASE,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return NextResponse.json(
        { error: `Partner token request failed: ${tokenRes.status}`, details: text },
        { status: tokenRes.status }
      );
    }

    const tokenData = await tokenRes.json();
    const partnerToken = tokenData.access_token;

    // Step 2: Register partner account with the partner token
    const registerRes = await fetch(`${FLEET_API_BASE}/api/1/partner_accounts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${partnerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ domain: process.env.TESLA_DOMAIN || "localhost" }),
    });

    const registerData = await registerRes.json();

    if (!registerRes.ok) {
      return NextResponse.json(
        { error: registerData.error || `Registration failed: ${registerRes.status}`, details: registerData },
        { status: registerRes.status }
      );
    }

    return NextResponse.json({ success: true, data: registerData });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Registration failed" },
      { status: 500 }
    );
  }
}
