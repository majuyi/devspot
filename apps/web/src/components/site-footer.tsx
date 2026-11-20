import type { Route } from "next";
import Link from "next/link";
import { REPO_URL } from "@/data/site";

const REPO = REPO_URL;

// "API" points at the OpenAPI document until the docs page at /api (M4.5).
const LINKS = [
  { href: "/about", label: "About" },
  { href: REPO, label: "Contribute on GitHub" },
  { href: "/status", label: "Status" },
  { href: "/api/v1/openapi.json", label: "API" },
  { href: `${REPO}/blob/main/LICENSE`, label: "Licence" },
  { href: "/calendar#subscribe", label: "Calendar feed" },
] as const;

/** Footer from board D. The paragraph is the one place the site describes itself. */
export function SiteFooter() {
  return (
    <footer className="mt-10 border-t border-line">
      <div className="mx-auto flex max-w-content flex-col gap-3.5 px-4 pt-6 pb-9 md:px-6">
        <span className="text-[18px] font-[650] tracking-[-0.035em]">devspot</span>
        <p className="max-w-[68ch] text-[13px] leading-[19px] text-muted">
          Opportunities for early-career tech people in Nigeria, read from each organisation's own
          page every six hours. Requirements are as stated by each organisation. devspot does not
          check who can apply.
        </p>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-4 text-[14px] md:grid-cols-6">
          {LINKS.map((item) =>
            // A JSON document and other sites are plain links, not client navigations.
            item.href.startsWith("https://") || item.href.startsWith("/api/") ? (
              <a
                key={item.href}
                href={item.href}
                className="flex min-h-target items-center no-underline hover:underline"
              >
                {item.label}
              </a>
            ) : (
              <Link
                key={item.href}
                href={item.href as Route}
                prefetch={false}
                className="flex min-h-target items-center no-underline hover:underline"
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>
        <p className="text-remainder text-faint">All times in West Africa Time (WAT)</p>
      </div>
    </footer>
  );
}
