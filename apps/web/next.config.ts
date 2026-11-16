import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages ship TypeScript source (db) or ESM (schema); Next compiles them.
  transpilePackages: ["@devspot/db", "@devspot/schema"],
  poweredByHeader: false,
  typedRoutes: true,
  /**
   * `/?city=lagos` is home with "Near you" for Lagos (docs/01 §3). Served from the cached
   * page at /in/lagos; before the filesystem, because `/` is itself a page. That page sends
   * a city it does not know back to `/`.
   */
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/",
          has: [{ type: "query", key: "city", value: "(?<city>[a-z-]+)" }],
          destination: "/in/:city",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default config;
