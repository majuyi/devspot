import { CITIES } from "@devspot/schema";
import type { Route } from "next";
import Link from "next/link";
import { CityPill } from "./city-pill";
import { MainNav } from "./main-nav";

const CITY_NAMES = Object.fromEntries(CITIES.map((c) => [c.slug, c.name]));

/**
 * Header from board D: wordmark, city pill, search button, then a scrolling nav row.
 * Static on purpose: reading a cookie here would make every page dynamic. The pill says
 * "Choose city" in the HTML and names the saved city once the page has loaded.
 */
export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto max-w-content">
        <div className="flex items-center gap-2 px-4 pt-2.5 md:px-6">
          <Link href="/" className="text-wordmark flex h-target grow items-center no-underline">
            devspot
          </Link>
          <CityPill names={CITY_NAMES} before={<PinIcon />} after={<ChevronIcon />} />
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
