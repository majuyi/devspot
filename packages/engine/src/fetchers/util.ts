/** Resolves `link` against `base`; only http(s) URLs come back. */
export function absoluteHttpUrl(link: string | undefined, base: string): string | undefined {
  if (!link) return undefined;
  try {
    const url = new URL(link.trim(), base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** RFC 822 and RFC 3339 both parse with Date; anything else is dropped, never guessed. */
export function isoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * An API's instant as "13 December 2026, 12:00 UTC", to the minute (never later than stated),
 * written so the rules extractor reads it back exactly. Adapters use it for date lines.
 */
export function utcLine(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}
