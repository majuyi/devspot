import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Migrations use the session pooler (DIRECT_URL). Runtime uses DATABASE_URL via the adapter.
  // Read without env() so generate and validate work in a clean clone with no .env; commands
  // that need a database still fail, with Prisma's own message.
  datasource: { url: process.env.DIRECT_URL },
});
