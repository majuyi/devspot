import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Migrations use the session pooler (DIRECT_URL). Runtime uses DATABASE_URL via the adapter.
  datasource: { url: env("DIRECT_URL") },
});
