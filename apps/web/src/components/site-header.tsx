import type { Route } from "next";
import Link from "next/link";
import { MainNav } from "./main-nav";

/**
 * Header from board D: wordmark, city pill, search button, then a scrolling nav row.
 * Static on purpose: reading the `prefs` cookie here would make every page dynamic, so the
 * pill says "Choose city" and links to /feed, where the city is set (01 §2, M2.8).
 */
export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto max-w-content">
        <div className="flex items-center gap-2 px-4 pt-2.5 md:px-6">
          <Link href="/" className="text-wordmark flex h-target grow items-center no-underline">
            devspot
          </Link>
          <Link
            href={"/feed" as Route}
            className="flex h-target items-center gap-1.5 rounded-pill border border-line px-3.5 text-[13.5px] font-medium no-underline hover:bg-raise"
          >
            <PinIcon />
            <span>Choose city</span>
            <ChevronIcon />
          </Link>
          <Link
            href={"/opportunities#q" as Route}
            aria-label="Search"
            className="flex size-target items-center justify-center rounded-pill border border-line no-underline hover:bg-raise"
          >
            <SearchIcon />
          </Link>
        </div>
        <MainNav />
      </div>
    </header>
  );
}

function PinIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}
