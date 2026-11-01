import type { Opportunity, Prisma, PrismaClient } from "@devspot/db";
import { htmlToText } from "./fetchers/html-text.js";
import type { HttpClient } from "./http.js";
import { applyVerification } from "./load.js";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const CLOSED_SIGNAL = /applications are closed|registration has ended|no longer accepting/i;

export type VerifyTarget = Pick<
  Opportunity,
  "canonicalUrl" | "kind" | "deadlineAt" | "startsAt" | "endsAt"
>;

export type VerifyResult =
  | { outcome: "verified" }
  | { outcome: "closed"; reason: string }
  /** Tells us nothing about the opportunity, so nothing changes. */
  | { outcome: "unreachable"; error: string };

/** The date after which an item is over. An event with one date is over when that day is. */
function lastDate({ kind, deadlineAt, startsAt, endsAt }: VerifyTarget): Date | null {
  if (kind === "event") return endsAt ?? startsAt ?? deadlineAt;
  return deadlineAt ?? endsAt;
}

/** Stage 6 (docs/04 §1). Invariant 7 first: a past date closes it whatever the source says. */
export async function verify(
  target: VerifyTarget,
  http: Pick<HttpClient, "get">,
  now: Date = new Date(),
): Promise<VerifyResult> {
  const last = lastDate(target);
  if (last && now.getTime() - last.getTime() > DAY)
    return { outcome: "closed", reason: "date-passed" };
  try {
    // Accept: */* because Devpost refuses anything else on hackathon pages.
    const { status, body } = await http.get(target.canonicalUrl, { accept: "*/*" });
    if (status === 404 || status === 410) return { outcome: "closed", reason: `http-${status}` };
    if (status < 200 || status >= 300) return { outcome: "unreachable", error: `HTTP ${status}` };
    const signal = htmlToText(body).text.replace(/\s+/g, " ").match(CLOSED_SIGNAL);
    if (signal) return { outcome: "closed", reason: `page-says: ${signal[0].toLowerCase()}` };
    return { outcome: "verified" };
  } catch (error) {
    return { outcome: "unreachable", error: error instanceof Error ? error.name : String(error) };
  }
}

/**
 * Published rows a verify pass looks at. docs/04 §1 says within 14 days of the deadline or 7
 * days unverified; every older past date is included too, because invariant 7 closes it on
 * the next pass and a row verified yesterday would otherwise wait.
 */
export function dueForVerify(now: Date): Prisma.OpportunityWhereInput {
  const inThreeDays = new Date(now.getTime() + 3 * DAY);
  const dayAgo = new Date(now.getTime() - DAY);
  return {
    status: "published",
    OR: [
      { deadlineAt: { lte: inThreeDays } },
      { endsAt: { lte: dayAgo } },
      { startsAt: { lte: dayAgo }, kind: "event" },
      { lastVerifiedAt: null },
      { lastVerifiedAt: { lt: new Date(now.getTime() - 7 * DAY) } },
    ],
  };
}

export type VerifySummary = {
  checked: number;
  verified: number;
  closed: number;
  unreachable: number;
};

/** `engine verify`: one item's failure never stops the pass. */
export async function verifyPublished(
  db: PrismaClient,
  http: HttpClient,
  {
    all = false,
    now = new Date(),
    organizationId,
  }: { all?: boolean; now?: Date; organizationId?: string } = {},
): Promise<VerifySummary> {
  const rows = await db.opportunity.findMany({
    where: {
      ...(all ? { status: "published" } : dueForVerify(now)),
      ...(organizationId ? { organizationId } : {}),
    },
  });
  const summary: VerifySummary = { checked: rows.length, verified: 0, closed: 0, unreachable: 0 };
  for (const row of rows) {
    const result = await verify(row, http, now);
    await applyVerification(db, row.id, result, now);
    summary[result.outcome]++;
  }
  return summary;
}
