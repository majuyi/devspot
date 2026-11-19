import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * docs/02 §7: one maintainer, one secret. The login form takes ADMIN_TOKEN and sets a cookie
 * holding an expiry and an HMAC of it keyed by the token. The token itself is never stored
 * in the browser, and changing ADMIN_TOKEN signs every session out.
 */
export const ADMIN_COOKIE = "admin";
export const SESSION_SECONDS = 30 * 24 * 60 * 60;
/** Shorter than this and admin stays off: a guessable token is worse than no admin. */
export const MIN_TOKEN_LENGTH = 32;

export function adminToken(): string | null {
  const token = process.env.ADMIN_TOKEN;
  return token && token.length >= MIN_TOKEN_LENGTH ? token : null;
}

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Constant-time, and the same length for any input, so nothing about the token leaks. */
export function tokenMatches(given: string): boolean {
  const token = adminToken();
  if (!token || !given) return false;
  return timingSafeEqual(digest(given), digest(token));
}

const mac = (token: string, expiresAt: number) =>
  createHmac("sha256", token).update(`admin.v1.${expiresAt}`).digest("base64url");

/** The cookie value for a session that ends `SESSION_SECONDS` from `now`. */
export function newSession(now = Date.now()): string | null {
  const token = adminToken();
  if (!token) return null;
  const expiresAt = now + SESSION_SECONDS * 1000;
  return `${expiresAt}.${mac(token, expiresAt)}`;
}

export function sessionValid(value: string | undefined, now = Date.now()): boolean {
  const token = adminToken();
  if (!token || !value) return false;
  const [expires, given, ...rest] = value.split(".");
  const expiresAt = Number(expires);
  if (rest.length || !given || !Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;
  return timingSafeEqual(digest(given), digest(mac(token, expiresAt)));
}

/** Where a signed-out request goes: pages to the login form, API paths get a 401. */
export function guard(
  pathname: string,
  cookie: string | undefined,
  now = Date.now(),
): "allow" | "login" | "unauthorized" {
  const api = pathname === "/api/admin" || pathname.startsWith("/api/admin/");
  const page = pathname === "/admin" || pathname.startsWith("/admin/");
  if (!api && !page) return "allow";
  if (pathname === "/admin/login") return "allow";
  if (sessionValid(cookie, now)) return "allow";
  return api ? "unauthorized" : "login";
}
