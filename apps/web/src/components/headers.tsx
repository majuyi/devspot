import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { GROUP_LABEL, GROUP_TONE, type Group, groupRange, type Tone } from "@/ui/urgency";

const TICK = { red: "bg-red", amber: "bg-amber", none: "bg-faint", closed: "bg-faint" };

/** `raise` band with a 2px urgency tick, a label and an optional mono range (docs/07 §5). */
export function BandHeader({ label, tone, range }: { label: string; tone: Tone; range?: string }) {
  return (
    <div
      data-band=""
      className="flex items-center justify-between border-t border-line bg-raise px-4 py-[7px] text-[12px] font-semibold"
    >
      <span className="flex items-center gap-[7px]">
        <span aria-hidden="true" className={`h-3 w-0.5 ${TICK[tone]}`} />
        {label}
      </span>
      {range ? <span className="text-date text-muted">{range}</span> : null}
    </div>
  );
}

/** The band for a deadline group: Today, Tomorrow, This week, Later. */
export function GroupHeader({ group, now }: { group: Group; now: Date }) {
  return (
    <BandHeader
      label={GROUP_LABEL[group]}
      tone={GROUP_TONE[group]}
      range={groupRange(group, now)}
    />
  );
}

/** Section heading with an optional "All 30 open" link and a note under it. */
export function SectionHeader({
  title,
  link,
  note,
  level = 2,
  id,
}: {
  /** For `aria-labelledby` on the section this heads. */
  id?: string;
  title: ReactNode;
  link?: { href: string; label: string };
  note?: ReactNode;
  level?: 2 | 3;
}) {
  const H = level === 2 ? "h2" : "h3";
  return (
    <div className="flex flex-col gap-1 px-4 pt-[30px] pb-3">
      <div className="flex items-baseline justify-between gap-3">
        <H id={id} className="text-section m-0">
          {title}
        </H>
        {link ? (
          <Link
            href={link.href as Route}
            className="flex min-h-target items-center text-[13px] text-muted no-underline hover:underline"
          >
            {link.label}
          </Link>
        ) : null}
      </div>
      {note ? <p className="text-meta m-0 text-faint">{note}</p> : null}
    </div>
  );
}
