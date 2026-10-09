import { z } from "zod";
import { OrganizationDto } from "./api.js";
import { OpportunityDto } from "./opportunity.js";

export const SNAPSHOT_VERSION = "1";

/** `opportunities.json` in the weekly release. See docs/06 §5. */
export const OpportunitySnapshot = z.object({
  version: z.literal(SNAPSHOT_VERSION),
  generatedAt: z.iso.datetime(),
  items: z.array(OpportunityDto),
});
export type OpportunitySnapshot = z.infer<typeof OpportunitySnapshot>;

/** `organizations.json` in the weekly release. */
export const OrganizationSnapshot = z.object({
  version: z.literal(SNAPSHOT_VERSION),
  generatedAt: z.iso.datetime(),
  items: z.array(OrganizationDto),
});
export type OrganizationSnapshot = z.infer<typeof OrganizationSnapshot>;

/** Either release file. `docs/schema/snapshot.schema.json` is emitted from this so both validate. */
export const SnapshotFile = z.union([OpportunitySnapshot, OrganizationSnapshot]);
export type SnapshotFile = z.infer<typeof SnapshotFile>;
