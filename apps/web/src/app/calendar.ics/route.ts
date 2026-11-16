import { calendarItems } from "@/data/calendar";
import { addMs, DAY, startOfDayWat } from "@/data/time";
import { filterLabel, MONTHS_AHEAD, parseCalendarParams } from "@/ui/calendar";
import { feedIcs } from "@/ui/ics";

/**
 * The calendar feed (docs/06 §3): every open item with a stated date from today on, with
 * `kinds`, `city` and `tags` filters. A filter that is not understood is ignored, so a
 * subscribed address never starts failing.
 */
export async function GET(req: Request) {
  const now = new Date();
  const p = parseCalendarParams(Object.fromEntries(new URL(req.url).searchParams), now);
  const from = startOfDayWat(now);
  const items = await calendarItems({
    from,
    // As far ahead as the calendar page goes.
    to: addMs(from, (MONTHS_AHEAD + 1) * 31 * DAY),
    kinds: p.kinds,
    city: p.city,
    tags: p.tags,
  });
  const what = filterLabel(p.kinds);
  return new Response(feedIcs(items, now, what ? `devspot: ${what}` : "devspot"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="devspot.ics"',
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=86400",
    },
  });
}
