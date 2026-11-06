import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { openapiDocument } from "../src/api/openapi";

// docs/06 §4: the document is versioned beside the JSON Schemas. A test fails when it is stale.
const out = resolve(import.meta.dirname, "../../../docs/schema/openapi.json");
writeFileSync(out, `${JSON.stringify(openapiDocument(), null, 2)}\n`);
console.log(`wrote ${out}`);
