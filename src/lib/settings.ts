import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

export interface AppSettings {
  demo_mode: boolean;
  background_polling: boolean;
  llm_provider: string;
  auth_password_hash: string;
  jwt_secret: string;
  production_url: string;
  tesla_access_token: string;
  tesla_refresh_token: string;
  tesla_token_expires_at: number;
  last_known_lat: number;
  last_known_lng: number;
  keys: {
    tesla_client_id: string;
    tesla_client_secret: string;
    xai_api_key: string;
    anthropic_api_key: string;
    openai_api_key: string;
    gemini_api_key: string;
  };
}

const SETTINGS_PATH = join(process.cwd(), "settings.json");

function generateJwtSecret(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  const bytes = require("crypto").randomBytes(48);
  for (let i = 0; i < 48; i++) result += chars[bytes[i] % chars.length];
  return result;
}

const DEFAULT_SETTINGS: AppSettings = {
  demo_mode: true,
  background_polling: false,
  llm_provider: "grok",
  auth_password_hash: "",
  jwt_secret: "",
  production_url: "https://yourdomain.com",
  tesla_access_token: "",
  tesla_refresh_token: "",
  tesla_token_expires_at: 0,
  last_known_lat: 0,
  last_known_lng: 0,
  keys: {
    tesla_client_id: "",
    tesla_client_secret: "",
    xai_api_key: "",
    anthropic_api_key: "",
    openai_api_key: "",
    gemini_api_key: "",
  },
};

let cached: AppSettings | null = null;

/** Read settings from settings.json, falling back to env vars */
export function getSettings(): AppSettings {
  if (cached) return cached;

  let settings: AppSettings;

  if (existsSync(SETTINGS_PATH)) {
    try {
      const raw = readFileSync(SETTINGS_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      // Merge with defaults to handle missing fields from older settings files
      settings = {
        demo_mode: parsed.demo_mode ?? true,
        background_polling: parsed.background_polling ?? false,
        llm_provider: parsed.llm_provider ?? "grok",
        auth_password_hash: parsed.auth_password_hash ?? "",
        jwt_secret: parsed.jwt_secret ?? "",
        production_url: parsed.production_url ?? "https://yourdomain.com",
        tesla_access_token: parsed.tesla_access_token ?? "",
        tesla_refresh_token: parsed.tesla_refresh_token ?? "",
        tesla_token_expires_at: parsed.tesla_token_expires_at ?? 0,
        last_known_lat: parsed.last_known_lat ?? 0,
        last_known_lng: parsed.last_known_lng ?? 0,
        keys: { ...DEFAULT_SETTINGS.keys, ...parsed.keys },
      };
    } catch {
      settings = { ...DEFAULT_SETTINGS };
    }
  } else {
    // Fall back to env vars
    const envDemo = process.env.USE_MOCK === "true" || process.env.NEXT_PUBLIC_USE_MOCK === "true";
    settings = {
      demo_mode: envDemo || true, // default true
      background_polling: false,
      llm_provider: process.env.LLM_PROVIDER || "grok",
      auth_password_hash: "",
      jwt_secret: "",
      production_url: "https://yourdomain.com",
      tesla_access_token: process.env.TESLA_ACCESS_TOKEN || "",
      tesla_refresh_token: process.env.TESLA_REFRESH_TOKEN || "",
      tesla_token_expires_at: 0,
      last_known_lat: 0,
      last_known_lng: 0,
      keys: {
        tesla_client_id: process.env.TESLA_CLIENT_ID || "",
        tesla_client_secret: process.env.TESLA_CLIENT_SECRET || "",
        xai_api_key: process.env.XAI_API_KEY || "",
        anthropic_api_key: process.env.ANTHROPIC_API_KEY || "",
        openai_api_key: process.env.OPENAI_API_KEY || "",
        gemini_api_key: process.env.GEMINI_API_KEY || "",
      },
    };
  }

  // Auto-generate JWT secret on first load if missing
  if (!settings.jwt_secret) {
    settings.jwt_secret = generateJwtSecret();
    try { writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2)); } catch { /* ok */ }
  }

  cached = settings;
  return settings;
}

/** Save settings to settings.json */
export function saveSettings(settings: AppSettings): void {
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  cached = settings;

  // Also update process.env so providers pick up new keys immediately
  if (settings.keys.xai_api_key) process.env.XAI_API_KEY = settings.keys.xai_api_key;
  if (settings.keys.anthropic_api_key) process.env.ANTHROPIC_API_KEY = settings.keys.anthropic_api_key;
  if (settings.keys.openai_api_key) process.env.OPENAI_API_KEY = settings.keys.openai_api_key;
  if (settings.keys.gemini_api_key) process.env.GEMINI_API_KEY = settings.keys.gemini_api_key;
  if (settings.keys.tesla_client_id) process.env.TESLA_CLIENT_ID = settings.keys.tesla_client_id;
  if (settings.keys.tesla_client_secret) process.env.TESLA_CLIENT_SECRET = settings.keys.tesla_client_secret;
  if (settings.llm_provider) process.env.LLM_PROVIDER = settings.llm_provider;
}

/** Check if demo mode is active — single source of truth */
export function isDemoModeFromSettings(): boolean {
  return getSettings().demo_mode;
}

/** Mask an API key for safe frontend display */
export function maskKey(key: string): string {
  if (!key || key.length < 8) return key ? "••••••••" : "";
  const prefix = key.slice(0, Math.min(8, key.indexOf("-") > 0 ? key.indexOf("-") + 4 : 8));
  const suffix = key.slice(-4);
  return `${prefix}••••${suffix}`;
}

/** Get settings with keys masked (safe for frontend) */
export function getMaskedSettings(): {
  demo_mode: boolean;
  background_polling: boolean;
  llm_provider: string;
  has_password: boolean;
  production_url: string;
  tesla_token_present: boolean;
  tesla_token_expires_at: number;
  keys: Record<string, string>;
  hasKey: Record<string, boolean>;
} {
  const settings = getSettings();
  const masked: Record<string, string> = {};
  const hasKey: Record<string, boolean> = {};

  for (const [k, v] of Object.entries(settings.keys)) {
    masked[k] = maskKey(v);
    hasKey[k] = !!v && v.length > 0;
  }

  return {
    demo_mode: settings.demo_mode,
    background_polling: settings.background_polling,
    llm_provider: settings.llm_provider,
    has_password: !!settings.auth_password_hash,
    production_url: settings.production_url,
    tesla_token_present: !!settings.tesla_access_token,
    tesla_token_expires_at: settings.tesla_token_expires_at,
    keys: masked,
    hasKey,
  };
}

/** Clear cache (call after writing settings) */
export function clearSettingsCache(): void {
  cached = null;
}
