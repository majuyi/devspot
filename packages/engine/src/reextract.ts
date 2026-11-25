import type { OpportunityStatus, PrismaClient } from "@devspot/db";
import { identityKey, type OpportunityInput, type OrgCategory } from "@devspot/schema";
import { extractRules } from "./extract/rules.js";
import { isMovable, load, statusFor } from "./load.js";
import { log as jsonLog } from "./log.js";
import { isOver } from "./over.js";
import { validateDraft } from "./validate.js";

export type ReextractDeps = {
  db: PrismaClient;
  now?: Date;
  log?: typeof jsonLog;
  source?: string;
  dryRun?: boolean;
};

export type Move = {
  url: string;
  title: string;
  from: OpportunityStatus | "new";
  to: OpportunityStatus;
  confidence: { from: number | null; to: number };
  deadlineAt: { from: string | null; to: string | null };
};

export type ReextractSummary = {
  checked: number;
  /** Reviewed, rejected, closed or flagged as a copy: the loader's rules leave these to people. */
  leftAlone: number;
  invalid: number;
  /** Status unchanged; on a real run the row still takes the new fields. */
  sameStatus: number;
  moves: Move[];
  /** "review → published": 12, and so on. */
  totals: Record<string, number>;
};

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

/**
 * `engine reextract`: runs extract, validate and load again over the page text already
 * stored, so rows scored by older rules get today's (docs/04 §2). Nothing is fetched.
 *
 * Only rows the loader may still move are touched: unreviewed, in review or published, not a
 * copy. Raw items with no row yet are loaded as new. Year-less dates resolve against when the
 * item was first seen, as they did on the run that stored it; the loader's clock is now, so a
 * listing already over closes (invariant 7). `dryRun` writes nothing and returns the same
 * report.
 */
export async function reextract({
  db,
  now = new Date(),
  log = jsonLog,
  source,
  dryRun = false,
}: ReextractDeps): Promise<ReextractSummary> {
  const items = await db.rawItem.findMany({
    where: {
      source: {
        enabled: true,
        organization: { enabled: true },
        ...(source ? { key: source } : {}),
      },
    },
    include: { source: { include: { organization: true } } },
    orderBy: { firstSeenAt: "asc" },
  });
  const summary: ReextractSummary = {
    checked: 0,
    leftAlone: 0,
    invalid: 0,
    sameStatus: 0,
    moves: [],
    totals: {},
  };

  for (const rawItem of items) {
    summary.checked++;
    const { organization: org } = rawItem.source;
    const existing = await db.opportunity.findUnique({
      where: { canonicalUrl: rawItem.canonicalUrl },
    });
    if (existing && (existing.reviewedAt || !isMovable(existing))) {
      summary.leftAlone++;
      continue;
    }
    const { draft, confidence } = extractRules({ item: rawItem, org, now: rawItem.firstSeenAt });
    const input = validateDraft(draft, {
      organizationId: org.id,
      rawItemId: rawItem.id,
      confidence,
      extractionMethod: "rules",
      discoveredVia: rawItem.source.kind,
    });
    if (!input.success) {
      summary.invalid++;
      log("item.invalid", {
        source: rawItem.source.key,
        url: rawItem.canonicalUrl,
        fields: input.error.issues.map((i) => i.path.join(".")),
      });
      continue;
    }
    const to = dryRun
      ? await previewStatus(db, input.data, existing, org, rawItem.firstSeenAt, now)
      : (
          await load(input.data, {
            db,
            orgSlug: org.slug,
            orgCategory: org.category,
            now,
            firstSeenAt: rawItem.firstSeenAt,
          })
        ).status;
    const from = existing?.status ?? "new";
    if (from === to) {
      summary.sameStatus++;
      continue;
    }
    const move: Move = {
      url: rawItem.canonicalUrl,
      title: input.data.title,
      from,
      to,
      confidence: { from: existing?.confidence ?? null, to: input.data.confidence },
      deadlineAt: { from: iso(existing?.deadlineAt), to: input.data.deadlineAt ?? null },
    };
    summary.moves.push(move);
    const label = `${from} → ${to}`;
    summary.totals[label] = (summary.totals[label] ?? 0) + 1;
    log(dryRun ? "reextract.would-move" : "reextract.moved", { ...move });
  }
  return summary;
}

/** What `load` would decide, from reads alone. */
async function previewStatus(
  db: PrismaClient,
  input: OpportunityInput,
  existing: Parameters<typeof statusFor>[0],
  org: { slug: string; category: OrgCategory },
  firstSeenAt: Date,
  now: Date,
): Promise<OpportunityStatus> {
  const date = (v: string | undefined) => (v ? new Date(v) : null);
  const over = isOver(
    {
      kind: input.kind ?? null,
      deadlineAt: date(input.deadlineAt),
      startsAt: date(input.startsAt),
      endsAt: date(input.endsAt),
    },
    now,
  );
  const isCopy =
    !existing &&
    (await db.opportunity.count({
      where: { identityKey: identityKey(org.slug, input, firstSeenAt) },
    })) > 0;
  return statusFor(existing, input, over, isCopy, org.category);
}
