import type { Metadata } from "next";
import { COLOR_GROUPS, RADII, TYPE_STYLES } from "@/styles/tokens";

export const metadata: Metadata = {
  title: "Tokens",
  robots: { index: false, follow: false },
};

// Literal class names, so Tailwind's scanner generates every type style.
const TYPE_CLASS: Record<(typeof TYPE_STYLES)[number], string> = {
  "page-title": "text-page-title",
  wordmark: "text-wordmark",
  section: "text-section",
  "row-title": "text-row-title",
  body: "text-body",
  prose: "text-prose",
  meta: "text-meta",
  status: "text-status",
  tag: "text-tag",
  "hero-figure": "text-hero-figure",
  countdown: "text-countdown",
  date: "text-date",
  remainder: "text-remainder",
};

const RADIUS_CLASS: Record<(typeof RADII)[number], string> = {
  tag: "rounded-tag",
  tile: "rounded-tile",
  chip: "rounded-chip",
  sheet: "rounded-sheet",
  pill: "rounded-pill",
};

const SAMPLE: Partial<Record<(typeof TYPE_STYLES)[number], string>> = {
  "hero-figure": "30",
  countdown: "27h",
  date: "Fri 3 Oct 2026",
  remainder: "14m",
};

/** Every token from docs/07, rendered in the reader's current theme. Not in the sitemap. */
export default function TokensPage() {
  return (
    <main className="mx-auto flex max-w-content flex-col gap-8 px-4 py-8 md:px-6">
      <h1 className="text-page-title">Tokens</h1>

      {Object.entries(COLOR_GROUPS).map(([group, names]) => (
        <section key={group} aria-labelledby={`g-${group}`} className="flex flex-col gap-3">
          <h2 id={`g-${group}`} className="text-section">
            {group}
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {names.map((name) => (
              <li key={name} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="size-10 shrink-0 rounded-tile border border-line"
                  style={{ background: `var(--${name})` }}
                />
                <code className="text-date">--{name}</code>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section aria-labelledby="g-type" className="flex flex-col gap-3">
        <h2 id="g-type" className="text-section">
          Type
        </h2>
        <ul className="flex flex-col gap-3">
          {TYPE_STYLES.map((style) => (
            <li key={style} className="flex items-baseline gap-4 border-t border-line pt-3">
              <code className="text-date w-28 shrink-0 text-muted">{style}</code>
              <span className={TYPE_CLASS[style]}>
                {SAMPLE[style] ?? "Lagos Startup Week fellowship"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="g-radius" className="flex flex-col gap-3">
        <h2 id="g-radius" className="text-section">
          Radius
        </h2>
        <ul className="flex flex-wrap gap-4">
          {RADII.map((r) => (
            <li key={r} className="flex flex-col items-center gap-2">
              <span
                aria-hidden="true"
                className={`size-16 border border-line bg-raise ${RADIUS_CLASS[r]}`}
              />
              <code className="text-date">{r}</code>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
