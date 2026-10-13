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
import { ELIGIBILITY_WORDS, extractRules, RULES_PUBLISH_THRESHOLD } from "./extract/rules.js";

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
    locationMode: LocationMode.optional(),
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

const SCORED = ["kind", "deadlineKind", "deadlineAt", "locationMode"] as const;
type Scored = (typeof SCORED)[number];

export type EvalReport = {
  items: number;
  opportunities: number;
  fields: Record<Scored, { correct: number; total: number; misses: string[] }>;
  /** Non-opportunities whose rules confidence would publish them. Must stay at zero. */
  falsePublishes: string[];
  /** Summaries containing eligibility words. Must stay at zero (docs/05 Acceptance). */
  eligibilityWordViolations: string[];
};

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
    falsePublishes: [],
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
    if (!expected.isOpportunity) {
      if (confidence >= RULES_PUBLISH_THRESHOLD) report.falsePublishes.push(id);
      continue;
    }
    report.opportunities++;
    for (const field of SCORED) {
      const want = expected[field];
      if (want === undefined) continue;
      const got = draft[field];
      const score = fields[field];
      score.total++;
      if (got === want) score.correct++;
      else score.misses.push(`${id}: expected ${want}, got ${got ?? "nothing"}`);
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
    `  false publishes          ${report.falsePublishes.length}`,
    `  eligibility words        ${report.eligibilityWordViolations.length}`,
  ];
  for (const f of SCORED)
    for (const miss of report.fields[f].misses) lines.push(`  miss ${f}: ${miss}`);
  for (const id of report.falsePublishes) lines.push(`  false publish: ${id}`);
  for (const id of report.eligibilityWordViolations)
    lines.push(`  eligibility word in summary: ${id}`);
  return lines.join("\n");
}
