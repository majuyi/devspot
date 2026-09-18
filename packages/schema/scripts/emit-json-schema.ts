import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { OpportunityDto, OpportunitySnapshot, OrganizationYaml } from "../src/index.js";

const out = resolve(import.meta.dirname, "../../../docs/schema");
mkdirSync(out, { recursive: true });
const targets = {
  "opportunity.schema.json": OpportunityDto,
  "organization-yaml.schema.json": OrganizationYaml,
  "snapshot.schema.json": OpportunitySnapshot,
} as const;
for (const [file, schema] of Object.entries(targets)) {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12" });
  writeFileSync(resolve(out, file), `${JSON.stringify(json, null, 2)}\n`);
  console.log(`wrote docs/schema/${file}`);
}
