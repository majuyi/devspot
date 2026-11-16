/** The public origin, with no trailing slash. DTO urls are built from it (docs/06 §2). */
export function siteUrl(): string {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const url =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (production ? `https://${production}` : "http://localhost:3000");
  return url.replace(/\/+$/, "");
}

/** The public repository: "Contribute" in the footer, "Report this listing" on a page. */
export const REPO_URL = "https://github.com/majuyi/devspot";
