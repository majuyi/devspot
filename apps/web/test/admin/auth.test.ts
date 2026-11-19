import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ADMIN_COOKIE,
  adminToken,
  guard,
  newSession,
  SESSION_SECONDS,
  sessionValid,
  tokenMatches,
} from "@/admin/auth";
import { proxy } from "@/proxy";

const TOKEN = "t".repeat(40);
const NOW = Date.parse("2026-11-04T12:00:00Z");

describe("admin sign-in (docs/02 §7)", () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = TOKEN;
  });
  afterEach(() => {
    delete process.env.ADMIN_TOKEN;
  });

  it("accepts only the exact token", () => {
    expect(tokenMatches(TOKEN)).toBe(true);
    expect(tokenMatches(`${TOKEN}x`)).toBe(false);
    expect(tokenMatches(TOKEN.slice(1))).toBe(false);
    expect(tokenMatches("")).toBe(false);
  });

  it("stays off without a token of at least 32 characters", () => {
    process.env.ADMIN_TOKEN = "short-token";
    expect(adminToken()).toBeNull();
    expect(tokenMatches("short-token")).toBe(false);
    expect(newSession(NOW)).toBeNull();
    delete process.env.ADMIN_TOKEN;
    expect(tokenMatches("")).toBe(false);
    expect(sessionValid("1.x", NOW)).toBe(false);
  });

  it("a session is valid until it expires, 30 days on", () => {
    const session = newSession(NOW) as string;
    expect(session.split(".")[0]).toBe(String(NOW + SESSION_SECONDS * 1000));
    expect(session).not.toContain(TOKEN);
    expect(sessionValid(session, NOW)).toBe(true);
    expect(sessionValid(session, NOW + SESSION_SECONDS * 1000 - 1)).toBe(true);
    expect(sessionValid(session, NOW + SESSION_SECONDS * 1000)).toBe(false);
  });

  it("rejects a session that was altered, extended or made up", () => {
    const session = newSession(NOW) as string;
    const [expires, mac] = session.split(".") as [string, string];
    expect(sessionValid(`${Number(expires) + 1}.${mac}`, NOW)).toBe(false);
    const flipped = `${mac.slice(0, -1)}${mac.endsWith("A") ? "B" : "A"}`;
    expect(sessionValid(`${expires}.${flipped}`, NOW)).toBe(false);
    expect(sessionValid(`${expires}.${mac}.extra`, NOW)).toBe(false);
    expect(sessionValid("not-a-session", NOW)).toBe(false);
    expect(sessionValid(undefined, NOW)).toBe(false);
  });

  it("changing the token signs every session out", () => {
    const session = newSession(NOW) as string;
    process.env.ADMIN_TOKEN = "u".repeat(40);
    expect(sessionValid(session, NOW)).toBe(false);
  });

  it.each([
    ["/admin", "login"],
    ["/admin/o/abc", "login"],
    ["/admin/new", "login"],
    ["/api/admin/anything", "unauthorized"],
    ["/api/admin", "unauthorized"],
    ["/admin/login", "allow"],
    // Not admin paths, whatever they look like.
    ["/administrator", "allow"],
    ["/api/administer", "allow"],
    ["/", "allow"],
  ] as const)("signed out, %s is %s", (path, decision) => {
    expect(guard(path, undefined, NOW)).toBe(decision);
    expect(guard(path, "forged.cookie", NOW)).toBe(decision);
  });

  it("signed in, every admin path is allowed", () => {
    const session = newSession(NOW) as string;
    for (const path of ["/admin", "/admin/o/abc", "/api/admin/anything"]) {
      expect(guard(path, session, NOW)).toBe("allow");
    }
  });

  describe("the proxy in front of /admin and /api/admin (M2.10 check)", () => {
    const request = (path: string, cookie?: string) =>
      new NextRequest(`https://devspot.test${path}`, {
        headers: cookie ? { cookie: `${ADMIN_COOKIE}=${cookie}` } : {},
      });

    it("redirects a signed-out page request to the login form", () => {
      const res = proxy(request("/admin/o/abc"));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("https://devspot.test/admin/login");
    });

    it("answers a signed-out API request with 401", async () => {
      const res = proxy(request("/api/admin/anything"));
      expect(res.status).toBe(401);
      expect((await res.json()).error.code).toBe("unauthorized");
    });

    it("lets the login form and a signed-in request through, never cached or indexed", () => {
      expect(proxy(request("/admin/login")).status).toBe(200);
      const res = proxy(request("/admin", newSession() as string));
      expect(res.status).toBe(200);
      expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(res.headers.get("cache-control")).toBe("no-store");
    });

    it("a forged cookie is signed out", () => {
      expect(proxy(request("/admin", "9999999999999.forged")).status).toBe(307);
    });
  });
});
