/** Usage: pnpm db:sync-registry. `engine run` does the same before each run. */
import { db } from "../src/client.ts";
import { syncRegistry } from "../src/sync-registry.ts";

console.log(JSON.stringify(await syncRegistry(db)));
await db.$disconnect();
