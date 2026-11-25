import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DeadlineKind,
  LocationMode,
  OpportunityKind,
  OrgCategory,
  RawItemInput,
} from "@devspot/schema";
import { z } from "zod";
import { canonicalizeUrl } from "./dedupe.js";
import { ELIGIBILITY_WORDS, extractRules } from "./extract/rules.js";
import { meetsPublishRule } from "./publish-rule.js";

export const EVAL_FILE = resolve(import.meta.dirname, "../test/eval/items.json");

/** One hand-labelled item. Fields left out of `expected` are not scored. */
const EvalItem = z.object({
  id: z.string(),
  org: z.object({ category: OrgCategory, country: z.string(), city: z.string().optional() }),
  item: RawItemInput,
  expected: z.object({
    isOpportunity: z.boolean(),
    kind: OpportunityKind.optional(),
    deadlineKind: DeadlineKind.optional(),
    deadlineAt: z.iso.datetime().optional(),
    /** False when the source gave a date only (stored as 23:59, docs/05 §1). */
    deadlineTimeStated: z.boolean().optional(),
    locationMode: LocationMode.optional(),
    country: z.string().length(2).optional(),
    city: z.string().optional(),
    /** The words on the page each label rests on, for the human review. Not scored. */
    evidence: z.record(z.string(), z.string().nullable()).optional(),
  }),
  note: z.string().optional(),
});
export const EvalSet = z.object({
  /** "Today" for items without a publish date, so results do not drift with the calendar. */
  asOf: z.iso.datetime(),
  labelledBy: z.string(),
  items: z.array(EvalItem),
});
export type EvalSet = z.infer<typeof EvalSet>;

const SCORED = ["kind", "deadlineKind", "deadlineAt", "locationMode", "country", "city"] as const;
type Scored = (typeof SCORED)[number];

export type EvalReport = {
  items: number;
  opportunities: number;
  fields: Record<Scored, { correct: number; total: number; misses: string[] }>;
  /** Deadlines on the right day in Lagos, whatever the time: tells a wrong date from a wrong time. */
  deadlineDay: { correct: number; total: number };
  /** Non-opportunities the loader's publish rule would publish. Must stay at zero. */
  falsePublishes: string[];
  /** Opportunities the publish rule would publish. */
  published: number;
  /**
   * Of those, the ones with a scored field wrong (kind, deadline or place), which a reader
   * would see and a maintainer would correct: the M3 gate's measure.
   */
  publishedWrong: string[];
  /** Summaries containing eligibility words. Must stay at zero (docs/05 Acceptance). */
  eligibilityWordViolations: string[];
};

/** The calendar day in Lagos (UTC+1 all year) of an ISO instant. */
const lagosDay = (iso: string) => new Date(Date.parse(iso) + 3_600_000).toISOString().slice(0, 10);

export function loadEvalSet(file = EVAL_FILE): EvalSet {
  return EvalSet.parse(JSON.parse(readFileSync(file, "utf8")));
}

/** Rules extraction over the labelled set (docs/05 §5). `--llm` arrives in M3. */
export function runEval(set: EvalSet): EvalReport {
  const now = new Date(set.asOf);
  const fields = Object.fromEntries(
    SCORED.map((f) => [f, { correct: 0, total: 0, misses: [] as string[] }]),
  ) as EvalReport["fields"];
  const report: EvalReport = {
    items: set.items.length,
    opportunities: 0,
    fields,
    deadlineDay: { correct: 0, total: 0 },
    falsePublishes: [],
    published: 0,
    publishedWrong: [],
    eligibilityWordViolations: [],
  };
  for (const { id, org, item, expected } of set.items) {
    const { draft, confidence } = extractRules({
      item: {
        title: item.title ?? null,
        text: item.text,
        canonicalUrl: canonicalizeUrl(item.url),
        publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
        meta: item.meta,
      },
      org,
      now,
    });
    if (draft.summary && ELIGIBILITY_WORDS.test(draft.summary))
      report.eligibilityWordViolations.push(id);
    // The loader's own rule (invariant 3), so a test listing it holds back is not counted.
    const publishes = meetsPublishRule(
      {
        title: draft.title,
        kind: draft.kind,
        locationMode: draft.locationMode,
        confidence,
        extractionMethod: "rules",
        deadlineAt: draft.deadlineAt,
        startsAt: draft.startsAt,
        deadlineKind: draft.deadlineKind,
      },
      org.category,
    );
    if (!expected.isOpportunity) {
      if (publishes) report.falsePublishes.push(id);
      continue;
    }
    report.opportunities++;
    const wrong: string[] = [];
    for (const field of SCORED) {
      const want = expected[field];
      if (want === undefined) continue;
      const got = draft[field];
      const score = fields[field];
      score.total++;
      if (got === want) score.correct++;
      else {
        score.misses.push(`${id}: expected ${want}, got ${got ?? "nothing"}`);
        wrong.push(field);
      }
    }
    if (publishes) {
      report.published++;
      if (wrong.length) report.publishedWrong.push(`${id}: ${wrong.join(", ")}`);
    }
    if (expected.deadlineAt) {
      report.deadlineDay.total++;
      if (draft.deadlineAt && lagosDay(draft.deadlineAt) === lagosDay(expected.deadlineAt))
        report.deadlineDay.correct++;
    }
  }
  return report;
}

export function formatReport(report: EvalReport): string {
  const pct = (c: number, t: number) => (t ? `${Math.round((100 * c) / t)}%` : "n/a");
  const lines = [
    `eval: ${report.items} items, ${report.opportunities} opportunities (rules only)`,
    ...SCORED.map((f) => {
      const { correct, total } = report.fields[f];
      return `  ${f.padEnd(13)} ${pct(correct, total).padStart(4)}  (${correct}/${total})`;
    }),
    `  deadline day  ${pct(report.deadlineDay.correct, report.deadlineDay.total).padStart(4)}  (${report.deadlineDay.correct}/${report.deadlineDay.total}, right day whatever the time)`,
    `  false publishes          ${report.falsePublishes.length}`,
    `  published, seen wrong    ${report.publishedWrong.length} of ${report.published}`,
    `  eligibility words        ${report.eligibilityWordViolations.length}`,
  ];
  for (const f of SCORED)
    for (const miss of report.fields[f].misses) lines.push(`  miss ${f}: ${miss}`);
  for (const id of report.falsePublishes) lines.push(`  false publish: ${id}`);
  for (const id of report.publishedWrong) lines.push(`  published wrong: ${id}`);
  for (const id of report.eligibilityWordViolations)
    lines.push(`  eligibility word in summary: ${id}`);
  return lines.join("\n");
}
