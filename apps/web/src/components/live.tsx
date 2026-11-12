"use client";

import { countdown, statusWord, type Timed, target, tone } from "@/ui/urgency";
import { StatusWord } from "./status-word";
import { useNow } from "./use-now";

const NUMERAL = { red: "text-red", amber: "text-amber", none: "text-fg", closed: "text-faint" };

/** The 52px left column of a dated row: `27h` over `14m`, or `Closed`. */
export function CountdownColumn({ item, serverNow }: { item: Timed; serverNow: string }) {
  const now = useNow(serverNow);
  const t = target(item);
  const c = t && item.status !== "closed" ? countdown(t.at, now, t.mode) : null;
  if (!c) {
    return (
      <div className="w-[52px] shrink-0 pt-[5px]">
        <span className="text-date text-[13px] font-medium text-faint">Closed</span>
      </div>
    );
  }
  const long = c.main.length > 4; // "Today" is set smaller so it fits the column
  return (
    <div className="flex w-[52px] shrink-0 flex-col gap-px">
      <span
        className={`text-countdown ${long ? "text-[18px] tracking-[-0.03em]" : ""} ${NUMERAL[tone(item, now)]}`}
      >
        {c.main}
      </span>
      {c.sub ? <span className="text-remainder text-faint">{c.sub}</span> : null}
    </div>
  );
}

/** The status word, recomputed on the client clock. */
export function LiveStatus({ item, serverNow }: { item: Timed; serverNow: string }) {
  const now = useNow(serverNow);
  const word = statusWord(item, now);
  return word ? <StatusWord tone={tone(item, now)}>{word}</StatusWord> : null;
}
