# 07 · Design system

> **What Opus needs to know.** One design system, from the Claude Design pass of November
> 2026 ("Flighty for opportunities"), defined as CSS custom properties in
> `apps/web/src/styles/tokens.css` and consumed through Tailwind 4's `@theme`. Geist and
> Geist Mono, neutrals plus two urgency colours and five kind families, full-bleed rows
> grouped by time with a countdown column, no shadows, no brand colour. The bar is the one
> stated in `docs/00-vision.md` section 5. When a page needs something not in this document,
> extend the document first, then the code.

## 1. Principles

1. **Time leads.** The countdown sits in the left column of every dated row. Lists are
   sorted by time and grouped under Today, Tomorrow, This week, Later.
2. **Colour means time, state or kind. Never decoration.** There is no brand colour and no
   accent. Links are `fg` and underlined.
3. **Show where it came from.** Every row carries the source domain and when it was last
   checked (`lastVerifiedAt`).
4. **Readable with no JavaScript.** Filters, pills and chips are plain links. The home map
   is a static SVG.
5. **Calm.** No gradients, glows, frosted glass, shadows, emoji, or cards with coloured left
   borders.
6. **Mobile is the default.** Design at 360px with a 16px gutter, then let it breathe up to
   1120px of content.
7. **Fast is a feature.** Two font files, no icon font, SVG icons inlined per use, images
   only where they carry information (organisation logos, generated share images).

## 2. Typography

Two variable fonts, self-hosted through `next/font` (the `geist` package): Geist for text,
Geist Mono for every date, countdown and count, with tabular numerals.

| Style | Face | Size / line | Weight | Tracking | Use |
|---|---|---|---|---|---|
| `page-title` | Geist | 22/28 | 600 | -0.025em | Page titles |
| `wordmark` | Geist | 20/24 | 650 | -0.035em | "devspot" as plain text in the header; no logo |
| `section` | Geist | 18/24 | 600 | -0.02em | Section headings |
| `row-title` | Geist | 15/20 | 550 | -0.01em | Row titles |
| `body` | Geist | 14/20 | 400 | | Rows, lists, dense UI |
| `prose` | Geist | 16/24 | 400 | | Paragraphs on `/o/[slug]` (summary, requirements), `/about`; max measure 68ch |
| `meta` | Geist | 12/16 | 400 | | Organisation, location, source line |
| `status` | Geist | 12/16 | 550 | | Status words |
| `tag` | Geist | 11/14 | 600 | | Kind tags |
| `hero-figure` | Geist Mono | 46/46 | 500 | -0.05em | Large figures where a board uses them |
| `countdown` | Geist Mono | 24/26 | 500 | -0.04em | Countdown numeral |
| `date` | Geist Mono | 12/16 | 400 | | Dates, counts |
| `remainder` | Geist Mono | 11/14 | 400 | | The smaller unit under the countdown |

`prose` is our addition to the design: 14px is right for scanning rows, too small for long
reading on a mid-range phone. Fallbacks: `system-ui, -apple-system, "Segoe UI", Roboto` for
sans and `ui-monospace, SFMono-Regular, Menlo` for mono, with metrics-matched fallbacks so
the swap causes no shift.

## 3. Colour tokens

Two themes following the system setting; dark is designed with the same care as light.
Light values go on `:root`; dark values in `@media (prefers-color-scheme: dark)`. All text
pairs pass WCAG AA in both themes; the tightest is `faint` on `raise` at 4.5:1.

**Neutrals**

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F6F7F8` | `#0D0E10` | Page ground and the sheet |
| `--surface` | `#FFFFFF` | `#16181B` | Pills and buttons on the map band |
| `--raise` | `#EEF0F2` | `#1A1C20` | Group headers, row hover, monogram tile |
| `--line` | `#DFE3E7` | `#26292E` | 1px dividers and outlines |
| `--fg` | `#111316` | `#EDEEF0` | Titles, numerals, links, selected fills, focus ring |
| `--muted` | `#555B62` | `#A0A6AD` | Organisation, dates, nav, neutral status words |
| `--faint` | `#686E75` | `#80868D` | Source line, neutral dots, closed state |

**Urgency.** Owns the countdown numeral, the status word and its dot, group-header ticks
and map dots. Also used for errors (`red`) and stale health (`amber`).

| Token | Light | Dark | Rule |
|---|---|---|---|
| `--red` | `#C42B1F` | `#FF6B5E` | Closes within 48 hours, or today |
| `--amber` | `#9A5B00` | `#F2A33A` | Closes, or an event starts, within 7 days |

Otherwise neutral (`fg` numeral, `muted` word, `faint` dot) for open, scheduled and rolling;
`faint` with a struck-through date for closed. Status is always a dot plus a word, never
colour alone.

**Map and logos**

| Token | Light | Dark | Use |
|---|---|---|---|
| `--sea` | `#E4E8EC` | `#15181C` | Map band ground |
| `--land` | `#FCFCFD` | `#23272C` | Map fill |
| `--land-line` | `#BCC3CB` | `#3D424A` | Map outline |
| `--logo-tile` | `#F5F6F8` | `#F5F6F8` | Behind logos, the same in both themes so dark logos stay visible |

**Kind families.** Kind lives only in a small tinted tag (`-bg` ground, `-fg` text) and the
kind filter chips, with the exact kind as the tag's word. Kind colours never use amber, red
or orange, and never appear on numerals, dots or the map.

| Family | Kinds | `-bg` light / dark | `-fg` light / dark |
|---|---|---|---|
| `--k-work` | job, internship | `#E3ECFB` / `#16233A` | `#1F4FA8` / `#8FB4F5` |
| `--k-build` | hackathon, competition | `#EEE7FB` / `#231B38` | `#5B34B0` / `#B9A0F2` |
| `--k-events` | event | `#DDF1EE` / `#102A27` | `#0E6A5E` / `#79D0C2` |
| `--k-funding` | scholarship, grant, fellowship | `#E5F0DF` / `#1A2A16` | `#3C6A2A` / `#A3CB8E` |
| `--k-prog` | bootcamp, ossProgram ("Open-source programme"), accelerator | `#E6E8F3` / `#1D2133` | `#3D4A7A` / `#A9B2DA` |

The kind-to-family map and the display words live in one module under
`apps/web/src/components`.

## 4. Spacing, radius, elevation

- Spacing: `--space-1` 4, `--space-2` 8, `--space-3` 12, `--space-4` 16, `--space-6` 24,
  `--space-8` 32, `--space-10` 40 px. Gutter 16px at 360, 24px from 768px; content max
  width 1120px. Rows are full-bleed with 1px `line` dividers and 14px top and bottom.
- `--target` 44px: minimum tap target, height of pills and icon buttons.
- Radius: `--radius-tag` 5, `--radius-tile` 8, `--radius-chip` 10, `--radius-sheet` 20
  (top corners of the sheet over the map band), `--radius-pill` 22.
- Focus ring: 2px `fg` outline, offset 2px.
- Elevation: none, anywhere. Layers separate with a 1px `line` or a `raise` ground.

## 5. Component inventory

| Component | Anatomy | States |
|---|---|---|
| **DatedRow** | countdown column (52px) · kind tag left, status word right · title · organisation and location · mono date · source domain and "checked 2h ago" · 44px add-to-calendar button. Whole row except the button is the link. | open, amber, red, deadline moved, closed (all `muted`/`faint`, grey tag, struck date, no calendar button) |
| **UndatedRow** | 36px logo tile on `logo-tile`, or a monogram on `raise`, in place of the countdown; otherwise as DatedRow with the deadline wording ("Rolling applications", "Deadline not stated on the source page") | rolling, unknown, multi-round |
| **Countdown** | mono numeral over remainder, per §6; rendered on the server, refreshed once a minute on the client | neutral, amber, red, ended |
| **GroupHeader** | `raise` ground, 2px urgency tick, label (Today, Tomorrow, This week, Later), mono date range right | per group |
| **StatusWord** | dot + word ("Closes today", "Closes tomorrow", "Closes Sat", "Open", "Deadline moved", "Closed", "Starts Fri", "Scheduled") | urgency colours |
| **KindTag** | 11px word on the family's tint, `radius-tag` | per family, closed (grey) |
| **KindChip** | 40px filter link, tinted like the tag, `radius-chip`; "All" selected is `fg` ground with `bg` text | idle, selected |
| **PlacePill** | 44px link, `surface` ground, urgency dot, name, mono count, `radius-pill`; "Remote" is a place | idle, selected (`fg` ground, `bg` text) |
| **NigeriaMap** | static server-rendered SVG: outline on `sea`, `land` fill, `land-line` stroke, one dot per city sized by open count and coloured by the most urgent item there | — |
| **CitySelector** | pill showing the current city; links to a city list (works without JS), enhanced to a sheet | none set, set |
| **DeadlineMoved** | old date struck through in `faint` above the new one | needs a deadline history (the proposed `opportunity_events` table, not yet agreed); hidden until then |
| **RequirementsBlock** | heading "Requirements, as stated by <org>", `prose` text with `white-space: pre-line`, 1px `line` border | present, absent ("The source does not list requirements.") |
| **SourceLine** | source domain · "checked 2h ago", `meta` in `faint` | — |
| **CalendarGrid** | 7-column month grid, urgency dots, selected day panel | month nav, day selected, empty day |
| **StatusBadge** | dot + word | healthy, stale (amber), erroring (red), new, disabled |
| **Button** | primary (`fg` ground, `bg` text), secondary (1px `line`), ghost, icon (44px round, `radius-pill`) | default, hover (`raise`), focus, disabled |
| **EmptyState** | short line, one action | per page |
| **Sheet** | `bg` ground, `radius-sheet` top corners, 1px `line` top edge, no shadow | open, closed |
| **ShareImage** | 1200×630, wordmark, kind tag, title, organisation, countdown and date | generated per opportunity |

There is no component library (shadcn/ui was dropped on 2026-11-11). Components are our
own, built on native elements (`<dialog>`, `<details>`, links) that work without
JavaScript.

## 6. Countdown and dates

- 48 hours or more: days, with hours below (`88d` / `9h`).
- Under 48 hours: hours, with minutes below (`27h` / `14m`).
- Under an hour: minutes only (`38m`).
- A date with no time, closing today: `Today`.
- Over 99 days: months (`4mo`).
- Dates in West Africa Time with weekday and year: `Fri 3 Oct 2026`. A time only when the
  source gives one.

## 7. Motion

- 150ms ease-out for hover and focus; 200ms for sheets; none for page loads.
- `prefers-reduced-motion` disables everything except opacity.
- No skeleton shimmer. Server-rendered pages arrive complete.

## 8. Layout patterns

- **Home:** a map band (static map, three figures, place pills on `sea`) with the sections
  in a sheet over it. Details in `01` §3.
- **Browse:** kind chips and place pills as links under the header; results as grouped rows.
- **Detail:** single column, `prose` at 68ch; key facts as a 2-column grid from 640px; the
  logo tile beside the title.
- **Events map (M4):** map fills viewport minus header; list as a sheet on mobile and a
  360px right panel on desktop.

## 9. Visual references

The Claude Design project "devspot home, stage 1" (artifact `3FkdJXB4RxEPKtbrbu7V8W`) holds
the agreed boards; build each page against its board in both themes, and where a board and
this document disagree, raise it before building.

| Board | Used by |
|---|---|
| D · Map band + board | `/` (M2.4, M2.4b) |
| Foundations, Components, Row states | tokens and components (M2.1b, M2.2) |
| Filtered list · results and empty | `/opportunities` (M2.4) |
| Opportunity page, Opportunity page · desktop | `/o/[slug]` (M2.5) |
| Share image · 1200 × 630 | `opengraph-image` (M2.5) |
| Calendar · mobile, Calendar · desktop month | `/calendar` (M2.7) |
| Status · normal and degraded | `/status` (M2.9) |
| Events map | `/events` map view (M4) |
| Home · desktop | `/` from 1024px |

Boards A, B and C are the unchosen home variations.

## 10. Iconography and imagery

- Lucide icons, inlined SVG, 16 and 20px, `currentColor`, each labelled.
- Organisation logos only, curated by hand, from the registry `logoUrl`: in tiles on
  UndatedRows and the opportunity page. Dated board rows stay text-only. Never event or
  hackathon artwork in lists.
- No stock imagery, no illustrations.

## 11. Do not

Planes, airport codes or boarding-pass gimmicks. Green-white-green or decorative African
patterns as identity. Purple gradients, glows, starfields. Bento grids, drop-shadowed rounded
cards, a centred hero with two buttons, abstract illustrations.

## Acceptance

- [x] `tokens.css` defines every token above for both themes; a visual test page `/dev/tokens` (excluded from sitemap) renders them.
- [ ] Every component in the inventory exists under `apps/web/src/components` with a Storybook-free story page `/dev/components`.
- [ ] Axe reports zero violations on `/`, `/opportunities`, `/o/[slug]`, `/events`, `/calendar`, in both themes.
- [ ] Fonts: exactly two `.woff2` files served, both preloaded, `font-display: swap`, CLS 0.
- [ ] Grep of `apps/web/src` for `box-shadow` and `shadow-` finds nothing.
