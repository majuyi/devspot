import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSON_SCHEMA_TARGETS, renderJsonSchema } from "../src/index.js";

const out = resolve(import.meta.dirname, "../../../docs/schema");
mkdirSync(out, { recursive: true });
for (const [file, schema] of Object.entries(JSON_SCHEMA_TARGETS)) {
  writeFileSync(resolve(out, file), renderJsonSchema(schema));
  console.log(`wrote docs/schema/${file}`);
}
