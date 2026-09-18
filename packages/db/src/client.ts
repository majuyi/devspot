import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const globalForPrisma = globalThis as unknown as { db?: PrismaClient };

function create(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

/** Singleton Prisma client. Runtime connections go through the pooled DATABASE_URL. */
export const db: PrismaClient = globalForPrisma.db ?? create();
if (process.env.NODE_ENV !== "production") globalForPrisma.db = db;
