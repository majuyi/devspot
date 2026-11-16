import { CitySlug } from "@devspot/schema";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Home } from "@/components/home";

/**
 * Home with a city chosen. Readers arrive at `/?city=lagos`; a rewrite in next.config.ts
 * serves this page for it, so each city's home is cached like `/` instead of being rendered
 * for every request, which reading the query in `/` would force.
 */
export const revalidate = 900;

// Nothing is built ahead: a city's page is rendered on its first visit, then cached.
export function generateStaticParams() {
  return [];
}

/** `/?city=all`: home with no city, whatever the reader has saved. */
const NO_CITY = "all";

type Props = { params: Promise<{ city: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city } = await params;
  // The address readers share is the query form, not this internal path.
  return {
    alternates: { canonical: city === NO_CITY ? "/" : `/?city=${encodeURIComponent(city)}` },
  };
}

export default async function HomeInCity({ params }: Props) {
  const { city: slug } = await params;
  if (slug === NO_CITY) return <Home />;
  const city = CitySlug.safeParse(slug);
  // A mistyped city gets home with no city. Not `/`: a reader whose cookie holds the bad
  // value would be rewritten straight back here. The redirect is cached and costs no query.
  if (!city.success) redirect(`/?city=${NO_CITY}`);
  return <Home city={city.data} />;
}
