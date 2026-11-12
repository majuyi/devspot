import type { Route } from "next";
import Link from "next/link";
import { type ReactNode, useId } from "react";
import { ArrowIcon } from "./icons";

/** Verbatim requirements (01 §1): never paraphrased, never a badge. */
export function RequirementsBlock({ orgName, text }: { orgName: string; text: string | null }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-tile border border-line p-4">
      <h2 id={id} className="text-section m-0 mb-2">
        Requirements, as stated by {orgName}
      </h2>
      {text ? (
        <p className="text-prose m-0 max-w-[68ch] whitespace-pre-line">{text}</p>
      ) : (
        <p className="text-prose m-0 text-muted">The source does not list requirements.</p>
      )}
    </section>
  );
}

export type HealthState = "healthy" | "stale" | "erroring" | "new" | "disabled";

const HEALTH: Record<HealthState, { word: string; text: string; dot: string }> = {
  healthy: { word: "Healthy", text: "text-muted", dot: "bg-faint" },
  stale: { word: "Stale", text: "text-amber", dot: "bg-amber" },
  erroring: { word: "Erroring", text: "text-red", dot: "bg-red" },
  new: { word: "New", text: "text-muted", dot: "border-[1.5px] border-faint" },
  disabled: { word: "Disabled", text: "text-faint", dot: "bg-line" },
};

/** Source health on /status and /org: dot and word. */
export function StatusBadge({ state }: { state: HealthState }) {
  const h = HEALTH[state];
  return (
    <span className={`text-status inline-flex items-center gap-[5px] ${h.text}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${h.dot}`} />
      {h.word}
    </span>
  );
}

/** The link that ends a list: "2 more in Lagos", "1 more from Devpost this month". */
export function ListEnding({
  href,
  children,
  strong = false,
}: {
  href: string;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <Link
      href={href as Route}
      className={`flex items-center justify-between border-t border-line px-4 no-underline hover:bg-raise ${
        strong ? "py-3.5 text-[14px] font-medium" : "py-[13px] text-[13px] text-muted"
      }`}
    >
      {children}
      <ArrowIcon size={strong ? 16 : 15} />
    </Link>
  );
}

/** One short line and one action (01 §1 Empty states). */
export function EmptyState({
  message,
  action,
}: {
  message: string;
  action: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-start gap-3 border-t border-line px-4 py-8">
      <p className="text-body m-0 text-muted">{message}</p>
      <ButtonLink href={action.href} variant="secondary">
        {action.label}
      </ButtonLink>
    </div>
  );
}

type Variant = "primary" | "secondary" | "ghost";

const VARIANT: Record<Variant, string> = {
  primary: "bg-fg text-bg hover:opacity-90",
  secondary: "border border-line text-fg hover:bg-raise",
  ghost: "text-fg hover:bg-raise",
};

export function buttonClass(variant: Variant): string {
  return `inline-flex h-target items-center justify-center gap-2 rounded-pill px-4 text-[14px] font-medium no-underline transition-colors duration-150 disabled:opacity-50 ${VARIANT[variant]}`;
}

export function ButtonLink({
  href,
  variant = "primary",
  children,
}: {
  href: string;
  variant?: Variant;
  children: ReactNode;
}) {
  return (
    <Link href={href as Route} className={buttonClass(variant)}>
      {children}
    </Link>
  );
}

export function Button({
  variant = "primary",
  children,
  ...props
}: { variant?: Variant; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...props} className={buttonClass(variant)}>
      {children}
    </button>
  );
}

/** 44px round icon control; `label` is required because the icon is hidden. */
export function IconLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      aria-label={label}
      className="flex size-target items-center justify-center rounded-pill text-muted hover:bg-raise hover:text-fg"
    >
      {children}
    </a>
  );
}

/** The board's sheet: `bg` ground with 20px top corners over a band, a 1px line, no shadow. */
export function Sheet({ children }: { children: ReactNode }) {
  return (
    <div className="relative -mt-[18px] flex flex-col rounded-t-sheet border-t border-line bg-bg">
      {children}
    </div>
  );
}
