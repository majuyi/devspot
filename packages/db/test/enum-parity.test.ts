import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as schema from "@devspot/schema";
import { describe, expect, it } from "vitest";

/** Parse `enum Name { a b c }` blocks out of schema.prisma. */
function prismaEnums(): Record<string, string[]> {
  const src = readFileSync(resolve(import.meta.dirname, "../prisma/schema.prisma"), "utf8");
  const out: Record<string, string[]> = {};
  for (const m of src.matchAll(/enum\s+(\w+)\s*\{([^}]*)\}/g)) {
    out[m[1] as string] = (m[2] as string)
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, "").trim())
      .filter(Boolean);
  }
  return out;
}

const pairs: Array<[string, { options: readonly string[] }]> = [
  ["OrgCategory", schema.OrgCategory],
  ["SourceKind", schema.SourceKind],
  ["Cadence", schema.Cadence],
  ["OpportunityKind", schema.OpportunityKind],
  ["DeadlineKind", schema.DeadlineKind],
  ["LocationMode", schema.LocationMode],
  ["OpportunityStatus", schema.OpportunityStatus],
  ["DiscoveredVia", schema.DiscoveredVia],
  ["ExtractionMethod", schema.ExtractionMethod],
  ["SubmissionChannel", schema.SubmissionChannel],
  ["SubmissionStatus", schema.SubmissionStatus],
];

describe("enum parity between Prisma and Zod", () => {
  const prisma = prismaEnums();
  for (const [name, zodEnum] of pairs) {
    it(name, () => {
      expect(prisma[name]).toEqual([...zodEnum.options]);
    });
  }
});
