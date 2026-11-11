/** Token names in tokens.css, grouped as docs/07 §3 lists them. /dev/tokens and the token test read this. */
export const COLOR_GROUPS = {
  Neutrals: ["bg", "surface", "raise", "line", "fg", "muted", "faint"],
  Urgency: ["amber", "red"],
  "Map and logos": ["sea", "land", "land-line", "logo-tile"],
  Kinds: [
    "k-work-bg",
    "k-work-fg",
    "k-build-bg",
    "k-build-fg",
    "k-events-bg",
    "k-events-fg",
    "k-funding-bg",
    "k-funding-fg",
    "k-prog-bg",
    "k-prog-fg",
  ],
} as const;

/** The same in both themes, so the dark block leaves it out. */
export const THEME_INVARIANT = ["logo-tile"] as const;

/** Text-on-ground pairs docs/07 §3 promises pass WCAG AA (4.5:1) in both themes. */
export const TEXT_PAIRS: ReadonlyArray<readonly [text: string, ground: string]> = [
  ...(["fg", "muted", "faint"] as const).flatMap((t) =>
    (["bg", "surface", "raise"] as const).map((g) => [t, g] as const),
  ),
  ["amber", "bg"],
  ["red", "bg"],
  ["bg", "fg"],
  ...(["work", "build", "events", "funding", "prog"] as const).map(
    (k) => [`k-${k}-fg`, `k-${k}-bg`] as const,
  ),
];

export const TYPE_STYLES = [
  "page-title",
  "wordmark",
  "section",
  "row-title",
  "body",
  "prose",
  "meta",
  "status",
  "tag",
  "hero-figure",
  "countdown",
  "date",
  "remainder",
] as const;

export const RADII = ["tag", "tile", "chip", "sheet", "pill"] as const;
