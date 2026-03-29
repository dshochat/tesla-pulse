import type { TeslaTokens } from "@/types/tesla";
import { getSettings, saveSettings, clearSettingsCache } from "./settings";

const TESLA_AUTH_URL = "https://auth.tesla.com/oauth2/v3/authorize";
const TESLA_TOKEN_URL = "https://auth.tesla.com/oauth2/v3/token";
const SCOPES = "openid offline_access vehicle_device_data vehicle_cmds vehicle_charging_cmds";

// In-memory token cache (server-side singleton in dev)
let cachedTokens: TeslaTokens | null = null;

/** Read Tesla credentials from settings.json first, then env vars */
function getTeslaConfig() {
  const settings = getSettings();
  return {
    clientId: settings.keys.tesla_client_id || process.env.TESLA_CLIENT_ID || "",
    clientSecret: settings.keys.tesla_client_secret || process.env.TESLA_CLIENT_SECRET || "",
  };
}

/** Persist tokens to settings.json + process.env + in-memory cache */
function persistTokens(tokens: TeslaTokens) {
  cachedTokens = tokens;
  process.env.TESLA_ACCESS_TOKEN = tokens.access_token;
  process.env.TESLA_REFRESH_TOKEN = tokens.refresh_token;

  // Persist to settings.json so tokens survive service restarts
  try {
    const settings = getSettings();
    settings.tesla_access_token = tokens.access_token;
    settings.tesla_refresh_token = tokens.refresh_token;
    settings.tesla_token_expires_at = tokens.expires_at || 0;
    saveSettings(settings);
    clearSettingsCache();
  } catch {
    // non-critical — tokens still in memory
  }
}

/** Build redirect URI dynamically from request host */
export function getRedirectUri(host?: string): string {
  if (process.env.TESLA_REDIRECT_URI) return process.env.TESLA_REDIRECT_URI;
  if (host) {
    const proto = host.includes("localhost") ? "http" : "https";
    return `${proto}://${host}/auth/callback`;
  }
  return "http://localhost:3000/auth/callback";
}

export function getAuthUrl(host?: string): string {
  const { clientId } = getTeslaConfig();
  const redirectUri = getRedirectUri(host);

  if (!clientId) {
    throw new Error("Tesla Client ID is not configured. Add it in Settings or .env.local");
  }

  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
  });

  return `${TESLA_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(code: string, host?: string): Promise<TeslaTokens> {
  const { clientId, clientSecret } = getTeslaConfig();
  const redirectUri = getRedirectUri(host);

  const res = await fetch(TESLA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const tokens: TeslaTokens = {
    ...data,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  persistTokens(tokens);
  return tokens;
}

export async function refreshAccessToken(): Promise<TeslaTokens> {
  const config = getTeslaConfig();
  const settings = getSettings();
  const refreshToken = cachedTokens?.refresh_token || settings.tesla_refresh_token || process.env.TESLA_REFRESH_TOKEN;

  if (!refreshToken) {
    throw new Error("No refresh token available");
  }

  const res = await fetch(TESLA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.clientId,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    const status = res.status;
    // Surface 403 specifically so the dashboard can show the right banner
    if (status === 403) {
      throw new TeslaAuthError(403, "Tesla blocked token refresh — re-authenticate locally and sync tokens");
    }
    throw new Error(`Token refresh failed: ${status} ${text}`);
  }

  const data = await res.json();
  const tokens: TeslaTokens = {
    ...data,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  persistTokens(tokens);
  return tokens;
}

export async function getAccessToken(): Promise<string> {
  const REFRESH_BUFFER = 5 * 60_000; // refresh 5 min before expiry

  // 1. Check in-memory cache — still valid?
  if (cachedTokens && cachedTokens.expires_at && cachedTokens.expires_at > Date.now() + REFRESH_BUFFER) {
    return cachedTokens.access_token;
  }

  // 2. Load from settings.json (persisted tokens survive restarts)
  const settings = getSettings();
  if (settings.tesla_access_token && !cachedTokens) {
    cachedTokens = {
      access_token: settings.tesla_access_token,
      refresh_token: settings.tesla_refresh_token,
      expires_in: 0,
      token_type: "Bearer",
      expires_at: settings.tesla_token_expires_at,
    };
    if (settings.tesla_token_expires_at > Date.now() + REFRESH_BUFFER) {
      return settings.tesla_access_token;
    }
  }

  // 3. Have a refresh token? Auto-refresh (access token expired or expiring soon)
  const refreshToken = cachedTokens?.refresh_token || settings.tesla_refresh_token;
  if (refreshToken) {
    console.log("[TeslaPulse] Access token expired/expiring, auto-refreshing...");
    try {
      const tokens = await refreshAccessToken();
      console.log(`[TeslaPulse] Token refreshed, expires ${new Date(tokens.expires_at!).toLocaleString()}`);
      return tokens.access_token;
    } catch (err) {
      console.log(`[TeslaPulse] Auto-refresh failed: ${err instanceof Error ? err.message : "unknown"}`);
      // Fall through to error
    }
  }

  // 4. Env var fallback
  const envToken = process.env.TESLA_ACCESS_TOKEN;
  if (envToken) return envToken;

  // 5. No tokens available
  throw new Error(
    "No valid Tesla access token. Please authenticate via /api/tesla/auth"
  );
}

/** Import tokens from external source (sync-token endpoint) */
export function importTokens(accessToken: string, refreshToken: string) {
  const tokens: TeslaTokens = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: 28800,
    token_type: "Bearer",
    expires_at: Date.now() + 8 * 3600 * 1000, // assume 8hr validity
  };
  persistTokens(tokens);
  return tokens;
}

export function setCachedTokens(tokens: TeslaTokens) {
  cachedTokens = tokens;
}

export function getCachedTokens(): TeslaTokens | null {
  return cachedTokens;
}

/** Custom error for 403 token refresh failures */
export class TeslaAuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "TeslaAuthError";
  }
}
