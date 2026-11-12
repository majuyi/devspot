import type { RowItem } from "./rows";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** 23:59 in Lagos on the day `days` from `now`: how a date-only deadline is stored. */
function endOfDayWat(now: Date, days: number): string {
  const lagosMidnight = Math.floor((now.getTime() + HOUR) / DAY) * DAY - HOUR;
  return new Date(lagosMidnight + days * DAY + DAY - 60_000).toISOString();
}

function base(slug: string, over: Partial<RowItem>): RowItem {
  return {
    slug,
    title: slug,
    kind: "hackathon",
    organization: { slug: "example", name: "Example Org", url: "https://example.org" },
    canonicalUrl: "https://example.org/opportunity",
    deadlineAt: null,
    deadlineKind: "fixed",
    startsAt: null,
    locationMode: "remote",
    country: null,
    city: null,
    status: "published",
    lastVerifiedAt: null,
    ...over,
  };
}

/** Rows in every state on the "Row states" board, relative to `now`. For /dev/components and tests. */
export function rowFixtures(now: Date) {
  const at = (ms: number) => new Date(now.getTime() + ms).toISOString();
  const checked = at(-2 * HOUR);
  return {
    within48h: base("gwc-hackathon", {
      title: "Girls Who Code HHS Hackathon 2026",
      organization: { slug: "devpost", name: "Devpost", url: "https://devpost.com" },
      canonicalUrl: "https://devpost.com/hackathons/gwc",
      deadlineAt: at(27 * HOUR + 14 * 60_000),
      lastVerifiedAt: checked,
    }),
    todayNoTime: base("open-data-grant", {
      title: "Example Open Data Grant",
      kind: "grant",
      deadlineAt: endOfDayWat(now, 0),
      lastVerifiedAt: checked,
    }),
    within7d: base("next-byte-hacks", {
      title: "Next Byte Hacks V5",
      organization: { slug: "devpost", name: "Devpost", url: "https://devpost.com" },
      canonicalUrl: "https://devpost.com/hackathons/next-byte",
      deadlineAt: at(3 * DAY + 19 * HOUR),
      lastVerifiedAt: checked,
    }),
    open: base("amd-challenge", {
      title: "AMD Global Physical AI Behavioral Safety Challenge",
      kind: "competition",
      organization: { slug: "zindi", name: "Zindi", url: "https://zindi.africa" },
      canonicalUrl: "https://zindi.africa/competitions/amd",
      deadlineAt: at(88 * DAY + 9 * HOUR),
      lastVerifiedAt: checked,
    }),
    moved: base("data-fellowship", {
      title: "Example Data Fellowship 2027",
      kind: "fellowship",
      deadlineAt: endOfDayWat(now, 23),
      lastVerifiedAt: checked,
    }),
    movedFrom: endOfDayWat(now, 9),
    multiRound: base("accelerator-cohort", {
      title: "Example Accelerator, Cohort 4",
      kind: "accelerator",
      deadlineKind: "multiRound",
      deadlineAt: endOfDayWat(now, 16),
      locationMode: "onsite",
      country: "NG",
      city: "lagos",
      lastVerifiedAt: checked,
    }),
    closed: base("wit-scholarship", {
      title: "Example Women in Tech Scholarship 2026",
      kind: "scholarship",
      status: "closed",
      deadlineAt: endOfDayWat(now, -5),
    }),
    rolling: base("graduate-engineer", {
      title: "Example Graduate Engineer",
      kind: "job",
      deadlineKind: "rolling",
      locationMode: "hybrid",
      country: "NG",
      city: "lagos",
      lastVerifiedAt: checked,
    }),
    notStated: base("ios-engineer", {
      title: "iOS Engineer",
      kind: "job",
      deadlineKind: "unknown",
      organization: { slug: "kuda", name: "Kuda", url: "https://kuda.com" },
      canonicalUrl: "https://kuda.com/careers/ios",
      locationMode: "hybrid",
      country: "NG",
      city: "lagos",
      lastVerifiedAt: checked,
    }),
    eventThisWeek: base("devfest-ilorin", {
      title: "DevFest Ilorin 2026",
      kind: "event",
      deadlineKind: "unknown",
      organization: { slug: "gdg-ilorin", name: "GDG Ilorin", url: "https://gdg.community.dev" },
      canonicalUrl: "https://gdg.community.dev/events/devfest-ilorin",
      startsAt: endOfDayWat(now, 2),
      locationMode: "onsite",
      country: "NG",
      city: "ilorin",
      lastVerifiedAt: checked,
    }),
    eventScheduled: base("devfest-calabar", {
      title: "DevFest Calabar 2026",
      kind: "event",
      deadlineKind: "unknown",
      organization: { slug: "gdg-calabar", name: "GDG Calabar", url: "https://gdg.community.dev" },
      canonicalUrl: "https://gdg.community.dev/events/devfest-calabar",
      startsAt: endOfDayWat(now, 17),
      locationMode: "onsite",
      country: "NG",
      city: "calabar",
      lastVerifiedAt: checked,
    }),
  };
}
