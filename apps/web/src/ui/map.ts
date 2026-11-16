import { type Tone, tone } from "./urgency";

/** The map's coordinate space (board "D · Map band + board"). */
export const MAP_WIDTH = 320;
export const MAP_HEIGHT = 284;

/** Nigeria's outline in that space, from the board. */
export const NIGERIA_OUTLINE =
  "M5.6 204.4L6.1 190.6L6.9 167.2L5.6 149L12.9 133.9L22 115.2L29 102.2L31.6 89.2L28.2 75.4L29.5 65.8L30.3 45L42 29.4L45.9 19.5L65.4 12.5L87.5 12.5L103.1 16.4L120 29.4L138.2 23.4L159 32L169.4 36.4L195.4 25.5L221.4 22.1L247.4 28.1L260.4 29.4L281.2 16.4L289.8 13.3L302 30.7L304.6 47.6L315 52.8L313.7 68.4L296.8 84L283.8 104.8L279.9 112.6L270.8 125.6L268.2 141.2L253.9 149L243.5 172.4L240.9 185.4L224 201L211 188L200.6 190.6L188.9 201L175.9 203.6L165.5 219.2L159 243.9L156.4 250.4L130.4 254.3L110.9 258.2L91.4 258.7L81 250.4L74.5 234.8L64.1 217.9L52.4 207.5L39.4 203.6L23.8 203.1Z";

/**
 * Longitude and latitude to the outline's space. The country spans too few degrees for the
 * projection to matter, so it is linear; the constants are a least-squares fit of the
 * board's dots to the city coordinates in @devspot/schema (within 2.5 units for seven of
 * eight; the board's Calabar was placed by hand).
 */
export function project(lat: number, lng: number): { x: number; y: number } {
  const round = (n: number) => Math.round(n * 10) / 10;
  return { x: round(26.209 * lng - 65.888), y: round(-25.677 * lat + 366.926) };
}

/**
 * Dot radius by open count: 9 for one item and 15 for five, as on the board. The square
 * root keeps area in proportion; the cap keeps a busy city from covering its neighbours.
 */
export function dotRadius(count: number): number {
  return Math.round(Math.min(20, 4 + 5 * Math.sqrt(Math.max(1, count))) * 10) / 10;
}

type Next = { nextDeadlineAt: string | null; nextStartsAt: string | null };

const RANK: Record<Tone, number> = { red: 2, amber: 1, none: 0, closed: 0 };

/**
 * The colour of a place: that of the most urgent item there, by the rules a row uses
 * (docs/07 §3). The soonest deadline and the soonest event start decide it between them.
 */
export function placeTone(place: Next, now: Date): Exclude<Tone, "closed"> {
  const item = { status: "published", deadlineKind: "fixed" } as const;
  const tones = [
    tone({ ...item, kind: "job", deadlineAt: place.nextDeadlineAt, startsAt: null }, now),
    tone(
      {
        ...item,
        kind: "event",
        deadlineKind: "unknown",
        deadlineAt: null,
        startsAt: place.nextStartsAt,
      },
      now,
    ),
  ];
  const worst = tones.reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
  return worst === "closed" ? "none" : worst;
}
