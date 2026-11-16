import type { SourceHealth, SourceKind } from "@devspot/schema";
import { DAY, HOUR } from "@/data/time";
import type { Tone } from "./urgency";

/**
 * How a source reads to a reader (board "Status"): by the time since its last good read.
 * Late after 8 hours, not the 6 between runs, because scheduled runs often start late and
 * every source would otherwise turn late before each run finished. Failing after 24.
 */
export const LATE_AFTER = 8 * HOUR;
export const FAILING_AFTER = DAY;

export type ReadState = "failing" | "late" | "onTime" | "new" | "off";

type Read = { health: SourceHealth; lastOkAt: string | null; kind?: SourceKind };

export function readState(s: Read, now: Date): ReadState {
  // A source entered by hand is never read by the engine, so it has no reading to be late.
  if (s.health === "disabled" || s.kind === "manual") return "off";
  // What the engine calls erroring (three failed reads running) is failing here too, even
  // when the last good read is recent: the two views must not contradict each other.
  if (s.health === "erroring") return "failing";
  if (!s.lastOkAt) return "new";
  const age = now.getTime() - Date.parse(s.lastOkAt);
  if (age > FAILING_AFTER) return "failing";
  return age > LATE_AFTER ? "late" : "onTime";
}

export const READ_WORD: Record<ReadState, string> = {
  failing: "Failing",
  late: "Late",
  onTime: "On time",
  new: "New",
  off: "Off",
};

export const READ_TONE: Record<ReadState, Tone> = {
  failing: "red",
  late: "amber",
  onTime: "none",
  new: "none",
  off: "closed",
};

/** Worst first, the order the reader's list uses. */
const ORDER: ReadState[] = ["failing", "late", "new", "onTime", "off"];
export const byReadState = (a: ReadState, b: ReadState) => ORDER.indexOf(a) - ORDER.indexOf(b);

export type Overview = {
  onTime: number;
  late: number;
  failing: number;
  /** Sources that have been read at least once and are switched on. */
  tracked: number;
  attention: boolean;
  headline: string;
  summary: string;
};

/** The top of `/status`: three counts, a headline and one honest sentence. */
export function overview(sources: readonly Read[], now: Date): Overview {
  const states = sources.map((s) => readState(s, now));
  const count = (state: ReadState) => states.filter((s) => s === state).length;
  const onTime = count("onTime");
  const late = count("late");
  const failing = count("failing");
  const tracked = onTime + late + failing;
  const behind = late + failing;
  const hours = LATE_AFTER / HOUR;
  const noun = (n: number) => (n === 1 ? "source" : "sources");
  if (tracked === 0) {
    return {
      onTime,
      late,
      failing,
      tracked,
      attention: false,
      headline: "No source has been read yet",
      summary: "Listings will appear after the engine's first run.",
    };
  }
  if (behind === 0) {
    return {
      onTime,
      late,
      failing,
      tracked,
      attention: false,
      headline: "Normal operations",
      summary:
        tracked === 1
          ? `The one source was read in the last ${hours} hours.`
          : `All ${tracked} sources read in the last ${hours} hours.`,
    };
  }
  return {
    onTime,
    late,
    failing,
    tracked,
    attention: true,
    headline: `${behind} ${noun(behind)} ${behind === 1 ? "needs" : "need"} attention`,
    summary: `${onTime} of ${tracked} sources read in the last ${hours} hours. Listings from the other ${behind === 1 ? "one" : behind} may be out of date.`,
  };
}

/** "2h ago", "3d ago", "just now". */
export function ago(at: string, now: Date): string {
  const ms = Math.max(0, now.getTime() - Date.parse(at));
  if (ms < 60_000) return "just now";
  if (ms < HOUR) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h ago`;
  return `${Math.floor(ms / DAY)}d ago`;
}
