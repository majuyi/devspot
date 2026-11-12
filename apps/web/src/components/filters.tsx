import type { Route } from "next";
import Link from "next/link";
import { FAMILY_LABEL, FAMILY_SELECTED, FAMILY_TINT, type Family } from "@/ui/kind";
import type { Tone } from "@/ui/urgency";
import { CloseIcon } from "./icons";

const DOT: Record<Tone, string> = {
  red: "bg-red",
  amber: "bg-amber",
  none: "bg-muted",
  closed: "bg-faint",
};

/** 44px place link: urgency dot (the most urgent item there), name, count. "Remote" is a place. */
export function PlacePill({
  name,
  count,
  tone,
  href,
  selected = false,
}: {
  name: string;
  count: number;
  tone: Tone;
  href: string;
  selected?: boolean;
}) {
  return (
    <Link
      href={href as Route}
      aria-current={selected ? "true" : undefined}
      className={`flex h-target shrink-0 items-center gap-[7px] whitespace-nowrap rounded-pill border pr-3.5 pl-3 text-[13px] font-medium no-underline ${
        selected ? "border-fg bg-fg text-bg" : "border-line bg-surface text-fg hover:bg-raise"
      }`}
    >
      <span aria-hidden="true" className={`size-[7px] rounded-full ${DOT[tone]}`} />
      {name}
      <span className="text-date text-[13px] opacity-75">
        <span className="sr-only">, </span>
        {count}
        <span className="sr-only"> open</span>
      </span>
    </Link>
  );
}

/**
 * 40px kind filter link, tinted like the tags. "All" selected is `fg`; a selected family
 * shows its colour as ground and a cross that clears it (one family at a time).
 */
export function KindChip({
  family,
  href,
  selected = false,
}: {
  family: Family | "all";
  href: string;
  selected?: boolean;
}) {
  const base =
    "flex h-10 shrink-0 items-center gap-1.5 rounded-chip px-3.5 text-[13px] font-semibold no-underline";
  if (family === "all") {
    return (
      <Link
        href={href as Route}
        aria-current={selected ? "true" : undefined}
        className={`${base} ${selected ? "bg-fg text-bg" : "border border-line text-fg hover:bg-raise"}`}
      >
        All
      </Link>
    );
  }
  return (
    <Link
      href={href as Route}
      aria-current={selected ? "true" : undefined}
      className={`${base} ${selected ? `${FAMILY_SELECTED[family]} pr-3` : FAMILY_TINT[family]}`}
    >
      {FAMILY_LABEL[family]}
      {selected ? (
        <>
          <CloseIcon />
          <span className="sr-only">, clear</span>
        </>
      ) : null}
    </Link>
  );
}

/** A linked figure with an urgency tick: `30` over "open" (home band, status page). */
export function StatusFigure({
  value,
  label,
  tone,
  href,
}: {
  value: number;
  label: string;
  tone: Tone;
  href: string;
}) {
  const tick = { red: "bg-red", amber: "bg-amber", none: "bg-faint", closed: "bg-faint" }[tone];
  return (
    <Link href={href as Route} className="flex flex-col gap-0.5 no-underline">
      <span className="text-countdown">{value.toLocaleString("en-GB")}</span>
      <span className="text-meta flex items-center gap-1.5 text-muted">
        <span aria-hidden="true" className={`h-3 w-0.5 ${tick}`} />
        {label}
      </span>
    </Link>
  );
}
