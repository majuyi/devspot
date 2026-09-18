import { z } from "zod";
import { OrganizationDto } from "./api.js";
import { OpportunityDto } from "./opportunity.js";

export const SNAPSHOT_VERSION = "1";

export const OpportunitySnapshot = z.object({
  version: z.literal(SNAPSHOT_VERSION),
  generatedAt: z.iso.datetime(),
  items: z.array(OpportunityDto),
});

export const OrganizationSnapshot = z.object({
  version: z.literal(SNAPSHOT_VERSION),
  generatedAt: z.iso.datetime(),
  items: z.array(OrganizationDto),
});
