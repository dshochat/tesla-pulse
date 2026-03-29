import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getSettings, saveSettings, clearSettingsCache } from "./settings";

const COOKIE_NAME = "teslapulse_session";
const TOKEN_EXPIRY = "7d";

/** Check if a password has been set */
export function isPasswordSet(): boolean {
  return !!getSettings().auth_password_hash;
}

/** Hash and store a new password */
export async function setPassword(password: string): Promise<void> {
  const hash = await bcrypt.hash(password, 12);
  const settings = getSettings();
  settings.auth_password_hash = hash;
  saveSettings(settings);
  clearSettingsCache();
}

/** Verify a password against the stored hash */
export async function verifyPassword(password: string): Promise<boolean> {
  const { auth_password_hash } = getSettings();
  if (!auth_password_hash) return false;
  return bcrypt.compare(password, auth_password_hash);
}

/** Create a signed JWT session token */
export function createSessionToken(): string {
  const { jwt_secret } = getSettings();
  return jwt.sign({ sub: "owner", iat: Math.floor(Date.now() / 1000) }, jwt_secret, {
    expiresIn: TOKEN_EXPIRY,
  });
}

/** Verify a session token — returns true if valid */
export function verifySessionToken(token: string): boolean {
  try {
    const { jwt_secret } = getSettings();
    jwt.verify(token, jwt_secret);
    return true;
  } catch {
    return false;
  }
}

/** Cookie name for use in middleware and routes */
export { COOKIE_NAME };
