import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Opportunity } from "@/components/opportunity";
import { getOpportunity, related } from "@/data/opportunities";
import { deadlineView } from "@/ui/deadline";
import { placeLabel } from "@/ui/place";

// Cached like every public page (docs/01 §1); each opportunity is rendered on its first
// visit, not at build time.
export const revalidate = 900;

export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const o = await getOpportunity((await params).slug);
  if (!o) return { title: "Not found" };
  // What a chat preview shows under the title: the deadline first, then who and where.
  const facts = `${deadlineView(o).line} · ${o.organization.name} · ${placeLabel(o)}`;
  const description = o.summary ? `${facts}. ${o.summary}`.slice(0, 300) : facts;
  const title = `${o.title} · ${o.organization.name}`;
  return {
    title,
    description,
    alternates: { canonical: `/o/${o.slug}` },
    openGraph: { type: "article", title, description, url: `/o/${o.slug}`, siteName: "devspot" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function OpportunityPage({ params }: Props) {
  const o = await getOpportunity((await params).slug);
  // A review item does not exist to the public (docs/01 §3).
  if (!o) notFound();
  return <Opportunity item={o} related={await related(o)} serverNow={new Date().toISOString()} />;
}
