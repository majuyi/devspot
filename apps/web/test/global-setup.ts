import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TestProject } from "vitest/node";

export const TEST_DATABASE = "devspot_web_test";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string | null;
    /** The same database as the restricted `web` role, with only the grants in grants.sql. */
    webDatabaseUrl: string | null;
    /** The same database as the `admin` role, which /admin connects as (ADR 0016). */
    adminDatabaseUrl: string | null;
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
    project.provide("webDatabaseUrl", null);
    project.provide("adminDatabaseUrl", null);
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
  await applyGrants(testUrl);
  const web = new URL(testUrl);
  web.username = "web";
  web.password = ROLE_TEST_PASSWORD;
  project.provide("databaseUrl", testUrl);
  project.provide("webDatabaseUrl", web.toString());
  const admin = new URL(testUrl);
  admin.username = "admin";
  admin.password = ROLE_TEST_PASSWORD;
  project.provide("adminDatabaseUrl", admin.toString());
}

// Test servers' roles, never production's: production's passwords live in the Keychain.
const ROLE_TEST_PASSWORD = "web-test-only";

/**
 * Creates the `web` and `admin` roles on the test server if missing and applies the real
 * grants.sql to the test database, so the role tests see exactly the grants production gets.
 */
async function applyGrants(testUrl: string) {
  const { createClient } = await import("@devspot/db");
  const su = createClient(testUrl);
  try {
    for (const name of ["web", "admin"]) {
      const role = await su.$queryRawUnsafe<unknown[]>(
        `SELECT 1 FROM pg_roles WHERE rolname = '${name}'`,
      );
      if (role.length === 0) {
        await su.$executeRawUnsafe(`CREATE ROLE ${name} LOGIN PASSWORD '${ROLE_TEST_PASSWORD}'`);
      }
      // Start from nothing, so a grant removed from the file is gone here too.
      await su.$executeRawUnsafe(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${name}`);
    }
    const sql = readFileSync(
      resolve(import.meta.dirname, "../../../packages/db/prisma/grants.sql"),
      "utf8",
    );
    // Every statement is a guarded DO block (so the file runs where a role is missing); run
    // them one at a time.
    for (const chunk of sql.split(/\$\$;/)) {
      if (!chunk.replace(/--.*$/gm, "").trim()) continue;
      if (!/\bdo \$\$/i.test(chunk)) throw new Error(`grants.sql: not a DO block: ${chunk.trim()}`);
      await su.$executeRawUnsafe(`${chunk}$$;`);
    }
  } finally {
    await su.$disconnect();
  }
}
