/** The public origin, with no trailing slash. DTO urls are built from it (docs/06 §2). */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}
