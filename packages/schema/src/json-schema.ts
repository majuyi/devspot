import { z } from "zod";
import { OpportunityDto } from "./opportunity.js";
import { OrganizationYaml } from "./organization.js";
import { SnapshotFile } from "./snapshot.js";

/** Files written to docs/schema/ by `build`. A test asserts the committed copies are current. */
export const JSON_SCHEMA_TARGETS = {
  "opportunity.schema.json": OpportunityDto,
  "organization-yaml.schema.json": OrganizationYaml,
  "snapshot.schema.json": SnapshotFile,
} as const;

export function renderJsonSchema(schema: z.ZodType): string {
  return `${JSON.stringify(z.toJSONSchema(schema, { target: "draft-2020-12" }), null, 2)}\n`;
}
