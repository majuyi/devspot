import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages ship TypeScript source (db) or ESM (schema); Next compiles them.
  transpilePackages: ["@devspot/db", "@devspot/schema"],
  poweredByHeader: false,
  typedRoutes: true,
};

export default config;
