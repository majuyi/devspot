import {
  CitySlug,
  findCity,
  normalizeTags,
  OpportunityKind,
  type Preferences,
  type Tag,
} from "@devspot/schema";
import type { Route } from "next";
import { FAMILIES, FAMILY_LABEL, KIND_PLURAL, kindsOf } from "./kind";

/**
 * A plain copy of the saved city beside the encoded `prefs` cookie. The home rewrite in
 * next.config.ts matches it with no code, and the header reads it to name the city.
 */
export const CITY_COOKIE = "city";

export const EMPTY_PREFS: Preferences = { v: 1, kinds: [], tags: [] };

type Search = Record<string, string | string[] | undefined>;

const all = (v: string | string[] | undefined | null): string[] =>
  (Array.isArray(v) ? v : v ? [v] : [])
    .flatMap((s) => s.split(","))
    .map((s) => s.trim())
    .filter(Boolean);

/** Preferences from loose values: unknown kinds, tags and cities are dropped, never fatal. */
function build(kinds: string[], city: string, tags: string[], remote: boolean): Preferences {
  const validKinds = [...new Set(kinds)].filter(
    (k): k is OpportunityKind => OpportunityKind.safeParse(k).success,
  );
  const validCity = CitySlug.safeParse(city);
  return {
    v: 1,
    kinds: validKinds,
    ...(validCity.success ? { city: validCity.data } : {}),
    tags: normalizeTags(tags),
    ...(remote ? { remoteOnly: true } : {}),
  };
}

/**
 * Preferences in a URL (`?kinds=job,internship&city=lagos&tags=ml&remote=1`), or null when
 * it names none. Any one of them makes the URL the whole feed for that request (docs/01 §2):
 * a shared link shows what its sender saw, not a mix with the reader's own.
 */
export function prefsFromSearch(sp: Search): Preferences | null {
  const kinds = all(sp.kinds);
  const city = all(sp.city)[0] ?? "";
  const tags = all(sp.tags);
  const remote = all(sp.remote)[0] === "1";
  if (!kinds.length && !city && !tags.length && !remote) return null;
  return build(kinds, city, tags, remote);
}

/** Preferences from the form: checkboxes arrive as repeated fields, browse sends lists. */
export function prefsFromForm(form: FormData): Preferences {
  const field = (name: string) =>
    form.getAll(name).flatMap((v) => (typeof v === "string" ? all(v) : []));
  return build(
    field("kinds"),
    field("city")[0] ?? "",
    field("tags"),
    ["1", "on"].includes(field("remote")[0] ?? ""),
  );
}

export function isEmptyPrefs(p: Preferences): boolean {
  return !p.kinds.length && !p.city && !p.tags.length && !p.remoteOnly;
}

/** The query-string form of a feed, the shape a shared link carries. */
export function prefsQuery(p: Preferences): string {
  const parts: string[] = [];
  if (p.kinds.length) parts.push(`kinds=${p.kinds.join(",")}`);
  if (p.city) parts.push(`city=${p.city}`);
  if (p.tags.length) parts.push(`tags=${p.tags.map(encodeURIComponent).join(",")}`);
  if (p.remoteOnly) parts.push("remote=1");
  return parts.join("&");
}

/** `/feed`, with preferences in the URL when given, and a cursor or the edit form. */
export function feedHref(
  p: Preferences | null = null,
  extra: { cursor?: string; edit?: boolean } = {},
): Route {
  const parts = [
    ...(p && !isEmptyPrefs(p) ? [prefsQuery(p)] : []),
    ...(extra.edit ? ["edit=1"] : []),
    ...(extra.cursor ? [`cursor=${encodeURIComponent(extra.cursor)}`] : []),
  ];
  return `/feed${parts.length ? `?${parts.join("&")}` : ""}` as Route;
}

/** The kinds as a reader would say them: whole families by name, the rest one by one. */
function kindsSummary(kinds: readonly OpportunityKind[]): string {
  const chosen = new Set(kinds);
  const parts: string[] = [];
  for (const f of FAMILIES) {
    const own = kindsOf(f);
    if (own.every((k) => chosen.has(k))) parts.push(FAMILY_LABEL[f]);
    else parts.push(...own.filter((k) => chosen.has(k)).map((k) => KIND_PLURAL[k]));
  }
  return parts.join(", ");
}

// Tags whose plain capitalised form would read wrong.
const TAG_LABEL: Record<string, string> = { ml: "ML", devops: "DevOps" };

const TAG_WORDS = (tags: readonly string[]) =>
  tags.map((t) => TAG_LABEL[t] ?? t.replace(/-/g, " ")).join(", ");

/** One line saying what a feed holds: "Work, Hackathons · Lagos, nationwide and remote". */
export function prefsSummary(p: Preferences): string {
  const where = p.remoteOnly
    ? "Remote only"
    : p.city
      ? `${findCity(p.city)?.name ?? p.city}, nationwide and remote`
      : "All of Nigeria and remote";
  return [
    p.kinds.length ? kindsSummary(p.kinds) : "Every kind",
    where,
    ...(p.tags.length ? [`Tagged ${TAG_WORDS(p.tags)}`] : []),
  ].join(" · ");
}

export function tagLabel(tag: Tag | string): string {
  const words = tag.replace(/-/g, " ");
  return TAG_LABEL[tag] ?? words.charAt(0).toUpperCase() + words.slice(1);
}

/** Where a form may send the reader afterwards: a path on this site, nothing else. */
export function safeNext(value: FormDataEntryValue | null, fallback = "/feed"): string {
  if (typeof value !== "string") return fallback;
  return /^\/(?![/\\])[\w\-./?=&,%#]*$/.test(value) ? value : fallback;
}
