import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages ship TypeScript source (db) or ESM (schema); Next compiles them.
  transpilePackages: ["@devspot/db", "@devspot/schema"],
  poweredByHeader: false,
  typedRoutes: true,
  /**
   * `/?city=lagos` is home with "Near you" for Lagos (docs/01 §3). Served from the cached
   * page at /in/lagos; before the filesystem, because `/` is itself a page. A reader with a
   * saved city (the plain `city` cookie /api/prefs writes) gets the same page at `/`, with
   * no code running per request. The query wins over the cookie, and `/?city=all` is home
   * with no city, which is how a reader with a saved city sees it.
   */
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/",
          has: [{ type: "query", key: "city", value: "(?<city>[a-z-]+)" }],
          destination: "/in/:city",
        },
        {
          source: "/",
          has: [{ type: "cookie", key: "city", value: "(?<city>[a-z-]+)" }],
          missing: [{ type: "query", key: "city" }],
          destination: "/in/:city",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default config;
