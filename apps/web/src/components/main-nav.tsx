"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Pages behind these links arrive in M2.6 and M2.7; the casts go once each route exists.
const NAV = [
  { href: "/opportunities", label: "Opportunities" },
  { href: "/events", label: "Events" },
  { href: "/calendar", label: "Calendar" },
  { href: "/org", label: "Organisations" },
] as const;

/**
 * The nav row. A client component only to mark the current page: the header is shared by
 * statically rendered pages, so it cannot be told the path on the server.
 */
export function MainNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav
      aria-label="Main"
      className="flex gap-[18px] overflow-x-auto whitespace-nowrap px-4 text-[13px] font-medium text-muted [scrollbar-width:none] md:px-6"
    >
      {NAV.map((item) => {
        const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href as Route}
            aria-current={current ? "page" : undefined}
            // The board marks the page with an inset shadow; a border keeps to "no shadows".
            className={`flex h-target items-center border-b-2 no-underline hover:text-fg ${
              current ? "border-fg text-fg" : "border-transparent hover:underline"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
