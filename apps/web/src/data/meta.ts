import { db } from "@devspot/db";
import { CITIES, OpportunityKind, TAGS } from "@devspot/schema";
import { OPEN } from "./dto";

/** `GET /api/v1/meta` (docs/06 §3) and the live numbers in the header and footer. */
export async function getMeta({ now = new Date() } = {}) {
  const [organizations, sources, openOpportunities, lastRun] = await Promise.all([
    db.organization.count({ where: { enabled: true } }),
    db.source.count({ where: { enabled: true, organization: { enabled: true } } }),
    db.opportunity.count({ where: OPEN }),
    db.fetchRun.aggregate({ _max: { finishedAt: true } }),
  ]);
  return {
    version: "1" as const,
    generatedAt: now.toISOString(),
    counts: { organizations, sources, openOpportunities },
    lastEngineRunAt: lastRun._max.finishedAt?.toISOString() ?? null,
    cities: CITIES.map(({ slug, name, state }) => ({ slug, name, state })),
    kinds: [...OpportunityKind.options],
    tags: [...TAGS],
  };
}
