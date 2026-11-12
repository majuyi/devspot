import type { Route } from "next";
import Link from "next/link";
import { GROUP_LABEL, GROUP_TONE, type Group, groupRange } from "@/ui/urgency";

const TICK = { red: "bg-red", amber: "bg-amber", none: "bg-faint", closed: "bg-faint" };

/** `raise` band with a 2px urgency tick, the label and a mono range (docs/07 §5). */
export function GroupHeader({ group, now }: { group: Group; now: Date }) {
  return (
    <div className="flex items-center justify-between border-t border-line bg-raise px-4 py-[7px] text-[12px] font-semibold">
      <span className="flex items-center gap-[7px]">
        <span aria-hidden="true" className={`h-3 w-0.5 ${TICK[GROUP_TONE[group]]}`} />
        {GROUP_LABEL[group]}
      </span>
      <span className="text-date text-muted">{groupRange(group, now)}</span>
    </div>
  );
}

/** Section heading with an optional "All 30 open" link and a note under it. */
export function SectionHeader({
  title,
  link,
  note,
  level = 2,
}: {
  title: string;
  link?: { href: string; label: string };
  note?: React.ReactNode;
  level?: 2 | 3;
}) {
  const H = level === 2 ? "h2" : "h3";
  return (
    <div className="flex flex-col gap-1 px-4 pt-[30px] pb-3">
      <div className="flex items-baseline justify-between gap-3">
        <H className="text-section m-0">{title}</H>
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
