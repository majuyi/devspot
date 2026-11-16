"use client";

import type { Route } from "next";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";

/**
 * The header's city pill. The header is part of cached pages, so the server cannot know the
 * reader's city: the HTML says "Choose city", and this reads the plain `city` cookie after
 * load and names it. `names` comes from the server so the city list stays out of the bundle.
 */
export function CityPill({
  names,
  before,
  after,
}: {
  names: Record<string, string>;
  before: ReactNode;
  after: ReactNode;
}) {
  const [city, setCity] = useState<string | null>(null);
  useEffect(() => {
    const slug = /(?:^|;\s*)city=([a-z-]+)/.exec(document.cookie)?.[1];
    setCity(slug ? (names[slug] ?? null) : null);
  }, [names]);
  return (
    <Link
      href={"/feed?edit=1" as Route}
      className="flex h-target items-center gap-1.5 rounded-pill border border-line px-3.5 text-[13.5px] font-medium no-underline hover:bg-raise"
    >
      {before}
      <span>{city ?? "Choose city"}</span>
      {after}
      {city ? <span className="sr-only">, change city</span> : null}
    </Link>
  );
}
