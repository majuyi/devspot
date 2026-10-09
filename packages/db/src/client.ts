import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export class MissingDatabaseUrlError extends Error {
  override readonly name = "MissingDatabaseUrlError";
  constructor() {
    super("DATABASE_URL is not set");
  }
}

const globalForPrisma = globalThis as unknown as { db?: PrismaClient };

function create(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new MissingDatabaseUrlError();
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

/** Singleton Prisma client. Runtime connections go through the pooled DATABASE_URL. */
export const db: PrismaClient = globalForPrisma.db ?? create();
if (process.env.NODE_ENV !== "production") globalForPrisma.db = db;
