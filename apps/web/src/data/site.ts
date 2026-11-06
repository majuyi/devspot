/** The public origin, with no trailing slash. DTO urls are built from it (docs/06 §2). */
export function siteUrl(): string {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const url =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (production ? `https://${production}` : "http://localhost:3000");
  return url.replace(/\/+$/, "");
}
