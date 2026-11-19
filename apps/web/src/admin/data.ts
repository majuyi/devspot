import type { Prisma } from "@devspot/db";
import { identityKey, OpportunityKind, type SourceHealth, sourceHealth } from "@devspot/schema";
import { adminDb } from "./db";

// In the order docs/01 §4 lists them.
export const TABS = ["review", "submissions", "duplicates", "sources", "all"] as const;
export type Tab = (typeof TABS)[number];

export const STATUSES = ["review", "published", "closed", "rejected"] as const;
export type Status = (typeof STATUSES)[number];

export const PAGE_SIZE = 50;

export type QueueFilters = {
  tab: Tab;
  q?: string;
  status?: Status;
  kind?: OpportunityKind;
  org?: string;
  page: number;
};

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || "";

/** The queue's state from its URL; anything not understood falls back to the default. */
export function parseQueue(sp: Search): QueueFilters {
  const tab = one(sp.tab);
  const status = one(sp.status);
  const kind = OpportunityKind.safeParse(one(sp.kind));
  const page = Number(one(sp.page));
  return {
    tab: (TABS as readonly string[]).includes(tab) ? (tab as Tab) : "review",
    q: one(sp.q).slice(0, 200) || undefined,
    status: (STATUSES as readonly string[]).includes(status) ? (status as Status) : undefined,
    kind: kind.success ? kind.data : undefined,
    org: one(sp.org) || undefined,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** The queue's URL for a state, defaults left out. Carried into an item so it can return. */
export function queueHref(f: Partial<QueueFilters> = {}): string {
  const parts: string[] = [];
  if (f.tab && f.tab !== "review") parts.push(`tab=${f.tab}`);
  if (f.q) parts.push(`q=${encodeURIComponent(f.q)}`);
  if (f.status) parts.push(`status=${f.status}`);
  if (f.kind) parts.push(`kind=${f.kind}`);
  if (f.org) parts.push(`org=${encodeURIComponent(f.org)}`);
  if (f.page && f.page > 1) parts.push(`page=${f.page}`);
  return parts.length ? `/admin?${parts.join("&")}` : "/admin";
}

const listSelect = {
  id: true,
  slug: true,
  title: true,
  kind: true,
  status: true,
  confidence: true,
  deadlineAt: true,
  deadlineKind: true,
  startsAt: true,
  canonicalUrl: true,
  updatedAt: true,
  organization: { select: { slug: true, name: true } },
} satisfies Prisma.OpportunitySelect;

export type QueueRow = Prisma.OpportunityGetPayload<{ select: typeof listSelect }>;

function where(f: QueueFilters): Prisma.OpportunityWhereInput {
  if (f.tab === "review") return { status: "review" };
  const and: Prisma.OpportunityWhereInput[] = [];
  if (f.status) and.push({ status: f.status });
  if (f.kind) and.push({ kind: f.kind });
  if (f.org) and.push({ organization: { slug: f.org } });
  if (f.q) {
    const contains = { contains: f.q, mode: "insensitive" } as const;
    and.push({
      OR: [{ title: contains }, { canonicalUrl: contains }, { organization: { name: contains } }],
    });
  }
  return { AND: and };
}

/** A page of the Review or All tab. Review is least sure first, the order to work in. */
export async function listQueue(f: QueueFilters): Promise<{ rows: QueueRow[]; total: number }> {
  const db = adminDb();
  const [rows, total] = await Promise.all([
    db.opportunity.findMany({
      where: where(f),
      select: listSelect,
      orderBy:
        f.tab === "review"
          ? [{ confidence: "asc" }, { id: "asc" }]
          : [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (f.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.opportunity.count({ where: where(f) }),
  ]);
  return { rows, total };
}

export async function tabCounts(): Promise<Record<Tab, number>> {
  const db = adminDb();
  const [review, all, submissions, duplicates, sources] = await Promise.all([
    db.opportunity.count({ where: { status: "review" } }),
    db.opportunity.count(),
    db.submission.count({ where: { status: "new" } }),
    duplicateKeys().then((keys) => keys.length),
    troubledSources().then((rows) => rows.length),
  ]);
  return { review, submissions, duplicates, sources, all };
}

/** Live rows: the ones a duplicate could still confuse a reader with. */
const LIVE: Prisma.OpportunityWhereInput = {
  status: { in: ["review", "published", "closed"] },
  duplicateOfId: null,
};

/** Identity keys two or more live rows share (docs/01 §4, Duplicates suggested). */
async function duplicateKeys(): Promise<string[]> {
  const groups = await adminDb().opportunity.groupBy({
    by: ["identityKey"],
    where: LIVE,
    _count: { _all: true },
    having: { identityKey: { _count: { gt: 1 } } },
    orderBy: { identityKey: "asc" },
  });
  return groups.map((g) => g.identityKey);
}

/** The Duplicates tab: each shared identity key with its rows, oldest first. */
export async function listDuplicateGroups() {
  const keys = await duplicateKeys();
  if (!keys.length) return [];
  const rows = await adminDb().opportunity.findMany({
    where: { ...LIVE, identityKey: { in: keys } },
    select: { ...listSelect, identityKey: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return keys.map((key) => ({ key, rows: rows.filter((r) => r.identityKey === key) }));
}

/** The Sources erroring tab: erroring and stale sources, with what went wrong last. */
export async function troubledSources() {
  const sources = await adminDb().source.findMany({
    include: {
      organization: { select: { slug: true, name: true, enabled: true } },
      _count: { select: { fetchRuns: true } },
      fetchRuns: {
        where: { ok: false },
        orderBy: { startedAt: "desc" },
        take: 1,
        select: { error: true, httpStatus: true, startedAt: true },
      },
    },
    orderBy: { key: "asc" },
  });
  const worst: SourceHealth[] = ["erroring", "stale"];
  return sources
    .map((s) => ({
      ...s,
      health: sourceHealth(
        { ...s, enabled: s.enabled && s.organization.enabled },
        s._count.fetchRuns,
      ),
    }))
    .filter((s) => worst.includes(s.health))
    .sort(
      (a, b) => worst.indexOf(a.health) - worst.indexOf(b.health) || a.key.localeCompare(b.key),
    );
}

/** "Mark duplicate of": up to ten other rows whose title or address contains the search. */
export async function duplicateCandidates(id: string, q: string) {
  const contains = { contains: q, mode: "insensitive" } as const;
  return adminDb().opportunity.findMany({
    where: {
      id: { not: id },
      duplicateOfId: null,
      status: { not: "rejected" },
      OR: [{ title: contains }, { canonicalUrl: contains }],
    },
    select: listSelect,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 10,
  });
}

/**
 * /admin/new step one: what already exists for this page or this opportunity. A row with
 * the same address blocks creation; one with the same identity key (organisation, title
 * without years and cohort numbers, cycle year) is shown so the maintainer can decide.
 */
export async function findExisting(
  orgSlug: string,
  canonicalUrl: string,
  title: string,
  now: Date,
) {
  const db = adminDb();
  const key = identityKey(orgSlug, { title }, now);
  const [sameUrl, sameKey] = await Promise.all([
    db.opportunity.findUnique({ where: { canonicalUrl }, select: listSelect }),
    db.opportunity.findMany({
      where: { identityKey: key, canonicalUrl: { not: canonicalUrl } },
      select: listSelect,
      orderBy: { createdAt: "asc" },
      take: 5,
    }),
  ]);
  return { sameUrl, sameKey };
}

export async function organizationOptions() {
  return adminDb().organization.findMany({
    select: { slug: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listSubmissions() {
  return adminDb().submission.findMany({
    where: { status: "new" },
    orderBy: { receivedAt: "desc" },
    take: PAGE_SIZE,
  });
}

/** One opportunity with what a reviewer needs beside it: its source text and its history. */
export async function getItem(id: string) {
  return adminDb().opportunity.findUnique({
    where: { id },
    include: {
      organization: { select: { slug: true, name: true } },
      rawItem: { select: { text: true, title: true, canonicalUrl: true } },
      duplicateOf: { select: { id: true, title: true } },
      events: { orderBy: { at: "desc" }, take: 20 },
    },
  });
}

export type Item = NonNullable<Awaited<ReturnType<typeof getItem>>>;

/** The next item to review after this one, least sure first: "Publish and next". */
export async function nextReviewId(excluding: string): Promise<string | null> {
  const next = await adminDb().opportunity.findFirst({
    where: { status: "review", id: { not: excluding } },
    orderBy: [{ confidence: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  return next?.id ?? null;
}
