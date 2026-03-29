import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "teslapulse_session";

// Paths that never require authentication
const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth/",
  "/api/debug/",
  "/api/tesla/callback",
  "/auth/callback",
  "/_next/",
  "/icons/",
  "/.well-known/",
];

const PUBLIC_EXACT = [
  "/manifest.json",
  "/sw.js",
  "/favicon.ico",
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

/** Base64url decode (JWT uses url-safe base64) */
function base64UrlDecode(str: string): string {
  // Replace url-safe chars and pad
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (padded.length % 4)) % 4);
  return atob(padded + padding);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow all public paths
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Check session cookie
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    // No session — redirect to login
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Basic JWT structure check
  const parts = token.split(".");
  if (parts.length !== 3) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Check if token is expired
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      // Token expired — clear cookie and redirect
      const res = NextResponse.redirect(new URL("/login", request.url));
      res.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
      return res;
    }
  } catch {
    // Invalid JWT — redirect to login
    const res = NextResponse.redirect(new URL("/login", request.url));
    res.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip all static files and _next internals
    "/((?!_next/static|_next/image|_next/webpack|icons|favicon\\.ico|manifest\\.json|sw\\.js).*)",
  ],
};
