import { CitySlug, findCity, OpportunityKind } from "@devspot/schema";
import type { Route } from "next";
import type { OpportunityFilters } from "@/data/opportunities";
import { FAMILY_LABEL, familyOf, kindList } from "./kind";

/** The filters `/opportunities` reads from its URL (docs/01 §3). */
export type BrowseParams = {
  q?: string;
  kinds: OpportunityKind[];
  city?: CitySlug;
  remote: boolean;
  tags: string[];
  org?: string;
  closing?: 2 | 7 | 30;
  sort: "deadline" | "new";
  /** `status=all`: closed items listed too. */
  closed: boolean;
  cursor?: string;
};

export type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || "";
const csv = (v: string) =>
  v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Lenient on purpose: a page never answers a mistyped filter with an error. Anything not
 * understood is dropped, so the view always matches the URL `browseHref` would write.
 */
export function parseBrowseParams(sp: SearchParams): BrowseParams {
  const kinds = csv(first(sp.kinds)).filter(
    (k): k is OpportunityKind => OpportunityKind.safeParse(k).success,
  );
  const city = CitySlug.safeParse(first(sp.city));
  const closing = Number(first(sp.closing));
  return {
    q: first(sp.q).slice(0, 200) || undefined,
    // In the order given, so "Scholarships, grants and fellowships" reads as the link wrote it.
    kinds: [...new Set(kinds)],
    city: city.success ? city.data : undefined,
    // One place at a time: a city wins over the remote toggle.
    remote: !city.success && first(sp.remote) === "1",
    tags: csv(first(sp.tags)),
    org: first(sp.org) || undefined,
    closing: closing === 2 || closing === 7 || closing === 30 ? closing : undefined,
    sort: first(sp.sort) === "new" ? "new" : "deadline",
    closed: first(sp.status) === "all",
    cursor: first(sp.cursor) || undefined,
  };
}

const EMPTY: BrowseParams = { kinds: [], remote: false, tags: [], sort: "deadline", closed: false };

/** The URL for a set of filters: defaults left out, fixed order, commas kept readable. */
export function browseHref(p: Partial<BrowseParams> = {}): Route {
  const f = { ...EMPTY, ...p };
  const parts: string[] = [];
  const add = (key: string, values: string[]) => {
    if (values.length) parts.push(`${key}=${values.map(encodeURIComponent).join(",")}`);
  };
  if (f.q) add("q", [f.q]);
  add("kinds", f.kinds);
  if (f.city) add("city", [f.city]);
  if (f.remote && !f.city) add("remote", ["1"]);
  add("tags", f.tags);
  if (f.org) add("org", [f.org]);
  if (f.closing) add("closing", [String(f.closing)]);
  if (f.sort === "new") add("sort", ["new"]);
  if (f.closed) add("status", ["all"]);
  if (f.cursor) add("cursor", [f.cursor]);
  return (parts.length ? `/opportunities?${parts.join("&")}` : "/opportunities") as Route;
}

export function toFilters(p: BrowseParams): OpportunityFilters {
  return {
    q: p.q,
    kinds: p.kinds.length ? p.kinds : undefined,
    city: p.city,
    remote: p.remote ? "1" : undefined,
    tags: p.tags.length ? p.tags : undefined,
    org: p.org,
    closingWithin: p.closing,
    sort: p.sort,
    status: p.closed ? "all" : "published",
    cursor: p.cursor,
  };
}

/** Whether anything narrows the list (sort, closed and cursor do not count). */
export function hasFilters(p: BrowseParams): boolean {
  return Boolean(
    p.q || p.kinds.length || p.city || p.remote || p.tags.length || p.org || p.closing,
  );
}

/** The kinds as a heading: a family's name, the kinds listed, or "Opportunities". */
function kindsHeading(p: BrowseParams): string | null {
  if (!p.kinds.length) return null;
  const family = familyOf(p.kinds);
  return family ? FAMILY_LABEL[family] : kindList(p.kinds);
}

const cityName = (slug: string) => findCity(slug)?.name ?? slug;

/** "Build", "Funding in Kano", "Remote opportunities". */
export function browseTitle(p: BrowseParams): string {
  const kinds = kindsHeading(p);
  if (p.city) return `${kinds ?? "Opportunities"} in ${cityName(p.city)}`;
  if (p.remote) return kinds ? `${kinds}, remote` : "Remote opportunities";
  return kinds ?? "Opportunities";
}

/** What the title leaves out, as short phrases; the count goes after them. */
export function browseNotes(p: BrowseParams): string[] {
  const notes: string[] = [];
  const family = familyOf(p.kinds);
  // "Events" needs no gloss; "Build" does.
  if (family && p.kinds.length > 1) notes.push(kindList(p.kinds));
  // A city filter means "available to someone there" (docs/01 §2), so say what that includes.
  if (p.city) notes.push("With nationwide and remote");
  if (p.q) notes.push(`Matching “${p.q}”`);
  if (p.org) notes.push(`From ${p.org}`);
  if (p.tags.length) notes.push(`Tagged ${p.tags.join(", ")}`);
  if (p.closing)
    notes.push(p.closing === 2 ? "Closing in 48 hours" : `Closing in ${p.closing} days`);
  return notes;
}

export function countLabel(total: number, closed: boolean): string {
  const n = total.toLocaleString("en-GB");
  return closed ? `${n} open or closed` : `${n} open`;
}

/** The heading of an empty result: what was asked for, said plainly. */
export function emptyHeading(p: BrowseParams): string {
  const what = p.closed ? "Nothing" : "Nothing open";
  if (p.q) return `${what} matches “${p.q}”`;
  const kinds = kindsHeading(p);
  const forKinds = kinds ? ` for ${kinds}` : "";
  if (p.city) return `${what}${forKinds} in ${cityName(p.city)} right now`;
  if (p.remote) return `${what}${forKinds} that is remote right now`;
  return `${what}${forKinds} right now`;
}

/** Ways out of an empty result, each dropping one thing; the last clears everything. */
export function emptyActions(p: BrowseParams): { href: string; label: string }[] {
  const actions: { href: string; label: string }[] = [];
  const kinds = kindsHeading(p);
  const rest = { ...p, cursor: undefined };
  if (kinds && (p.city || p.remote)) {
    actions.push({
      href: browseHref({ ...rest, city: undefined, remote: false }),
      label: `${kinds} in every place`,
    });
  }
  if (p.city && (kinds || p.q)) {
    actions.push({
      href: browseHref({ city: p.city, closed: p.closed }),
      label: `Everything in ${cityName(p.city)}`,
    });
  }
  if (hasFilters(p))
    actions.push({ href: browseHref({ closed: p.closed }), label: "Everything open" });
  else actions.push({ href: "/", label: "Back to home" });
  return actions;
}
