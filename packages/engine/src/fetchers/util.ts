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
