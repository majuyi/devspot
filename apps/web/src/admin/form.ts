import {
  CitySlug,
  DeadlineKind,
  LocationMode,
  normalizeTags,
  OpportunityKind,
} from "@devspot/schema";
import { HOUR } from "@/data/time";

/** The fields a maintainer can change. Identity (organisation, canonical URL) is not here. */
export type Editable = {
  title: string;
  kind: OpportunityKind | null;
  summary: string | null;
  applyUrl: string | null;
  opensAt: Date | null;
  deadlineAt: Date | null;
  deadlineKind: DeadlineKind;
  deadlineTimezone: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  locationMode: LocationMode | null;
  country: string | null;
  city: string | null;
  venueName: string | null;
  venueAddress: string | null;
  regionsTags: string[];
  requirementsText: string | null;
  tags: string[];
};

export const EDITABLE_FIELDS = [
  "title",
  "kind",
  "summary",
  "applyUrl",
  "opensAt",
  "deadlineAt",
  "deadlineKind",
  "deadlineTimezone",
  "startsAt",
  "endsAt",
  "locationMode",
  "country",
  "city",
  "venueName",
  "venueAddress",
  "regionsTags",
  "requirementsText",
  "tags",
] as const satisfies readonly (keyof Editable)[];

/** A form that cannot be saved. The message is for the maintainer. */
export class InvalidForm extends Error {
  override readonly name = "InvalidForm";
}

const text = (form: FormData, name: string): string => {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
};
const orNull = (s: string) => (s === "" ? null : s);

/**
 * A date and an optional time, both as the source states them in Lagos (UTC+1). With no
 * time the instant is 23:59 that day, the stored form of a date-only value (docs/05 §1):
 * the pages show it as a date alone. Never a time nobody stated.
 */
export function lagosInstant(date: string, time: string, field: string): Date | null {
  if (!date) {
    if (time) throw new InvalidForm(`${field}: a time needs a date`);
    return null;
  }
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = time ? /^(\d{2}):(\d{2})$/.exec(time) : ["", "23", "59"];
  if (!d || !t) throw new InvalidForm(`${field}: not a date and time`);
  const utc = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  const at = new Date(utc - HOUR);
  if (Number.isNaN(at.getTime())) throw new InvalidForm(`${field}: not a date and time`);
  return at;
}

/** The form's two inputs for a stored instant: the Lagos date, and the time unless 23:59. */
export function lagosInputs(at: Date | null): { date: string; time: string } {
  if (!at) return { date: "", time: "" };
  const iso = new Date(at.getTime() + HOUR).toISOString();
  const time = iso.slice(11, 16);
  return { date: iso.slice(0, 10), time: time === "23:59" ? "" : time };
}

function oneOf<T extends string>(options: readonly T[], value: string, field: string): T | null {
  if (value === "") return null;
  if (!(options as readonly string[]).includes(value)) {
    throw new InvalidForm(`${field}: "${value}" is not one of the choices`);
  }
  return value as T;
}

function url(value: string, field: string): string | null {
  if (value === "") return null;
  try {
    const u = new URL(value);
    if (u.protocol === "https:" || u.protocol === "http:") return u.toString();
  } catch {}
  throw new InvalidForm(`${field}: not a web address`);
}

/** The editable fields from the review form. Throws InvalidForm with a message to show. */
export function parseEditable(form: FormData): Editable {
  const title = text(form, "title");
  if (!title) throw new InvalidForm("Title: required");
  const instant = (name: string, label: string) =>
    lagosInstant(text(form, `${name}Date`), text(form, `${name}Time`), label);
  const deadlineKind = oneOf(DeadlineKind.options, text(form, "deadlineKind"), "Deadline kind");
  const deadlineAt = instant("deadlineAt", "Deadline");
  const kind = deadlineKind ?? "unknown";
  // Never guess a date: a date belongs only with a kind that has one.
  if (deadlineAt && (kind === "unknown" || kind === "rolling")) {
    throw new InvalidForm(`Deadline: a "${kind}" deadline has no date. Choose fixed or rounds.`);
  }
  if (kind === "fixed" && !deadlineAt) {
    throw new InvalidForm("Deadline: a fixed deadline needs the date the source states.");
  }
  const country = text(form, "country").toUpperCase();
  if (country && !/^[A-Z]{2}$/.test(country)) {
    throw new InvalidForm("Country: two letters, such as NG");
  }
  const city = oneOf(CitySlug.options, text(form, "city"), "City");
  const locationMode = oneOf(LocationMode.options, text(form, "locationMode"), "Location");
  // 01 §1: remote items never claim a city.
  if (locationMode === "remote" && city) {
    throw new InvalidForm("City: a remote item has no city.");
  }
  const summary = text(form, "summary");
  if (summary.length > 280) throw new InvalidForm("Summary: at most 280 characters");
  const list = (name: string) =>
    form.getAll(name).flatMap((v) => (typeof v === "string" ? v.split(",") : []));
  return {
    title,
    kind: oneOf(OpportunityKind.options, text(form, "kind"), "Kind"),
    summary: orNull(summary),
    applyUrl: url(text(form, "applyUrl"), "Apply link"),
    opensAt: instant("opensAt", "Opens"),
    deadlineAt,
    deadlineKind: kind,
    deadlineTimezone: orNull(text(form, "deadlineTimezone")),
    startsAt: instant("startsAt", "Starts"),
    endsAt: instant("endsAt", "Ends"),
    locationMode,
    country: orNull(country),
    city,
    venueName: orNull(text(form, "venueName")),
    venueAddress: orNull(text(form, "venueAddress")),
    regionsTags: list("regionsTags")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    // Verbatim: the organisation's words, untrimmed inside, only the form's edge whitespace.
    requirementsText: orNull(
      typeof form.get("requirementsText") === "string"
        ? (form.get("requirementsText") as string).replace(/\r\n/g, "\n").trim()
        : "",
    ),
    tags: normalizeTags(list("tags")),
  };
}

type Json = string | number | boolean | null | Json[];
const plain = (v: unknown): Json =>
  v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.map(plain) : ((v ?? null) as Json);

/** `{ field: { from, to } }` for the editable fields that differ: the history row's body. */
export function diff(before: Editable, after: Editable): Record<string, { from: Json; to: Json }> {
  const changes: Record<string, { from: Json; to: Json }> = {};
  for (const field of EDITABLE_FIELDS) {
    const from = plain(before[field]);
    const to = plain(after[field]);
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[field] = { from, to };
  }
  return changes;
}

/** What a published row must have (data/dto PUBLIC): a kind and a location mode. */
export function publishBlockers(o: Pick<Editable, "kind" | "locationMode">): string[] {
  return [
    ...(o.kind ? [] : ["Kind: choose one before publishing"]),
    ...(o.locationMode ? [] : ["Location: choose remote, on site or hybrid before publishing"]),
  ];
}

/** Where an action may send the maintainer back to: a path under /admin, nothing else. */
export function safeBack(value: FormDataEntryValue | string | null | undefined): string {
  return typeof value === "string" && /^\/admin(?:[/?#][\w\-./?=&,%#]*)?$/.test(value)
    ? value
    : "/admin";
}
