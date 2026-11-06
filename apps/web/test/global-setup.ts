import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import type { TestProject } from "vitest/node";

export const TEST_DATABASE = "devspot_web_test";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string | null;
  }
}

/**
 * The web tests get their own database on the same server (the Docker one locally, the service
 * container in CI). The engine's tests create and delete published rows while they run, and
 * these tests count published rows, so sharing a database would make them flaky.
 */
export default async function setup(project: TestProject) {
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile(resolve(import.meta.dirname, "../../../.env"));
    } catch {}
  }
  const base = process.env.DATABASE_URL;
  if (!base) {
    if (process.env.CI) throw new Error("DATABASE_URL must be set in CI");
    project.provide("databaseUrl", null);
    return;
  }
  const url = new URL(base);
  url.pathname = `/${TEST_DATABASE}`;
  const testUrl = url.toString();

  const { db } = await import("@devspot/db");
  const exists = await db.$queryRaw<unknown[]>`
    SELECT 1 FROM pg_database WHERE datname = ${TEST_DATABASE}`;
  if (exists.length === 0) await db.$executeRawUnsafe(`CREATE DATABASE ${TEST_DATABASE}`);
  await db.$disconnect();

  execFileSync("pnpm", ["--filter", "@devspot/db", "exec", "prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: testUrl, DIRECT_URL: testUrl },
    stdio: "ignore",
  });
  project.provide("databaseUrl", testUrl);
}
