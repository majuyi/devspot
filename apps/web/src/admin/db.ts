import { createClient, type PrismaClient } from "@devspot/db";

/** Production must name the admin role's connection: it never borrows the public one. */
export class MissingAdminDatabaseUrl extends Error {
  override readonly name = "MissingAdminDatabaseUrl";
  constructor() {
    super("ADMIN_DATABASE_URL is not set");
  }
}

const globalForAdmin = globalThis as unknown as { adminDb?: PrismaClient; adminDbUrl?: string };

/**
 * The client `/admin` reads and writes with (ADR 0016): the `admin` role through
 * ADMIN_DATABASE_URL. The public pages keep their read-only `web` connection. Outside
 * production it falls back to DATABASE_URL, so local development needs no second role.
 */
function adminUrl(): string | undefined {
  return (
    process.env.ADMIN_DATABASE_URL ||
    (process.env.NODE_ENV === "production" ? undefined : process.env.DATABASE_URL)
  );
}

/** Whether admin has a database to talk to; the layout says so plainly when it has not. */
export function adminDbConfigured(): boolean {
  return Boolean(adminUrl());
}

export function adminDb(): PrismaClient {
  const url = adminUrl();
  if (!url) throw new MissingAdminDatabaseUrl();
  if (!globalForAdmin.adminDb || globalForAdmin.adminDbUrl !== url) {
    globalForAdmin.adminDb = createClient(url);
    globalForAdmin.adminDbUrl = url;
  }
  return globalForAdmin.adminDb;
}
