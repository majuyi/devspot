import type { Tone } from "@/ui/urgency";

const TEXT: Record<Tone, string> = {
  red: "text-red",
  amber: "text-amber",
  none: "text-muted",
  closed: "text-faint",
};

const DOT: Record<Tone, string> = {
  red: "bg-red",
  amber: "bg-amber",
  none: "bg-faint",
  closed: "border-[1.5px] border-faint",
};

/** A dot and a word, never colour alone (docs/07 §3). */
export function StatusWord({ tone, children }: { tone: Tone; children: string }) {
  return (
    <span className={`text-status flex shrink-0 items-center gap-[5px] ${TEXT[tone]}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${DOT[tone]}`} />
      {children}
    </span>
  );
}
