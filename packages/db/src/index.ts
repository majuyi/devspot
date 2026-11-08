export { createClient, db, MissingDatabaseUrlError } from "./client.ts";
export * from "./generated/prisma/client";
// The registry sync reads YAML from disk, so it has its own entry, @devspot/db/registry,
// and the web app's bundle never loads it.
