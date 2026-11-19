import type { Prisma } from "@devspot/db";
import { OpportunityKind } from "@devspot/schema";
import { adminDb } from "./db";

export const TABS = ["review", "all", "submissions"] as const;
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
  const [review, all, submissions] = await Promise.all([
    db.opportunity.count({ where: { status: "review" } }),
    db.opportunity.count(),
    db.submission.count({ where: { status: "new" } }),
  ]);
  return { review, all, submissions };
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
