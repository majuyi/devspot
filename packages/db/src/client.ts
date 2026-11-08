import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export class MissingDatabaseUrlError extends Error {
  override readonly name = "MissingDatabaseUrlError";
  constructor() {
    super("DATABASE_URL is not set");
  }
}

const globalForPrisma = globalThis as unknown as { db?: PrismaClient };

/** A client for a given URL, outside the singleton: tests that connect as another role. */
export function createClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

function create(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new MissingDatabaseUrlError();
  return createClient(connectionString);
}

function client(): PrismaClient {
  if (!globalForPrisma.db) globalForPrisma.db = create();
  return globalForPrisma.db;
}

/**
 * Singleton Prisma client. Runtime connections go through the pooled DATABASE_URL.
 *
 * Created on first use, not on import, so `next build` can load route modules without a
 * database; a query with no DATABASE_URL still throws MissingDatabaseUrlError.
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_, prop) {
    const c = client();
    const value = Reflect.get(c, prop, c);
    return typeof value === "function" ? value.bind(c) : value;
  },
});
