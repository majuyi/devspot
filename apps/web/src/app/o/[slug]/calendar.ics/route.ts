import { getOpportunity } from "@/data/opportunities";
import { opportunityIcs } from "@/ui/ics";

/** One VEVENT for the opportunity (docs/06 §3); 404 when it has no date or is not public. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const o = await getOpportunity(slug);
  const ics = o ? opportunityIcs(o, new Date()) : null;
  if (!ics) {
    return new Response("Not found\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.ics"`,
      // The CDN may keep it as long as a page; a moved deadline shows on the next download.
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=86400",
    },
  });
}
