# 07 · Design system

> **What Opus needs to know.** One design system, defined as CSS custom properties in
> `apps/web/src/styles/tokens.css`, consumed through Tailwind 4's `@theme`. Two typefaces,
> an 8-point spacing scale, a small semantic colour set with light and dark values, a fixed
> component inventory, and motion only for state change. The bar is the one stated in
> `docs/00-vision.md` section 5. When a page needs something not in this document, extend the
> document first, then the code.

## 1. Principles

1. **Information first.** The reader is scanning for what is open, what closes soon and what is
   near them. Typography and spacing do that work; decoration does not.
2. **Calm urgency.** Deadlines are the most important number on any screen. They get colour;
   almost nothing else does.
3. **Trust through restraint.** Verbatim requirements sit in a plain bordered block. No
   badges that could be read as endorsement.
4. **Mobile is the default.** Design at 360px, then let it breathe up to 1200px.
5. **Fast is a feature.** Two font files, no icon font, SVG icons inlined per use, images
   only where they carry information (organization logos, generated share images).

## 2. Typography

| Role | Face | Weight | Size / line (mobile → desktop) |
|---|---|---|---|
| Display (page titles) | Manrope (variable, self-hosted) | 700 | 28/34 → 40/46, tracking -0.02em |
| Heading (section) | Manrope | 600 | 20/28 → 24/32 |
| Body | Manrope | 400, 500 for emphasis | 16/24 → 17/26, max measure 68ch |
| Meta (dates, chips, counts) | IBM Plex Mono | 400, 500 | 12/16 and 13/18, tabular numerals |

Fallbacks: `system-ui, -apple-system, "Segoe UI", Roboto` with `size-adjust` metrics set so
the swap causes no shift. The countdown and every date use the mono face so digits align.

## 3. Colour tokens

Light values first; dark values in `@media (prefers-color-scheme: dark)` guarded by
`:root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#FAFAF7` | `#0F1210` | page |
| `--surface` | `#FFFFFF` | `#161A17` | cards, panels |
| `--surface-2` | `#F1F1EC` | `#1E231F` | filter bar, table stripes |
| `--ink` | `#151814` | `#ECEEEA` | primary text |
| `--ink-2` | `#4C524B` | `#A7ADA6` | secondary text |
| `--ink-3` | `#7C837B` | `#7A817A` | placeholders, disabled |
| `--line` | `#E3E4DE` | `#2A302B` | borders |
| `--accent` | `#0B6E4F` | `#5BC49A` | links, primary button, focus ring |
| `--accent-soft` | `#E2F3EC` | `#12352A` | accent backgrounds |
| `--urgent` | `#B42318` | `#F28B82` | deadlines within 7 days, errors |
| `--urgent-soft` | `#FBEAE7` | `#3A1A17` | urgent chip background |
| `--warn` | `#8A5A0C` | `#E0B15E` | stale health, cautions |
| `--ok` | `#1F7A3E` | `#7CD38E` | healthy |

Kind colours are a single hue ramp used only on chips and calendar dots, never on text:
internship `#2F6FED`, job `#0B6E4F`, fellowship `#7A3FBF`, scholarship `#B8620E`, grant
`#8A5A0C`, hackathon `#D12F6A`, ossProgram `#0F766E`, event `#C2410C`, competition
`#4F46E5`, accelerator `#0369A1`, bootcamp `#6D28D9`. Each has a `-soft` background at 12%
alpha on light and 22% on dark. Contrast of chip text on soft background must pass AA.

## 4. Spacing, radius, elevation

- Scale: 4, 8, 12, 16, 24, 32, 48, 64 px as `--space-1` … `--space-8`. Page gutter 16px at
  mobile, 24px from 768px, content max width 1120px.
- Radius: 6px controls, 10px cards, 999px chips.
- Elevation: none by default. Cards use a 1px `--line` border. A single hover state raises
  the border to `--ink-3`. No drop shadows except the map popover and the mobile sheet
  (`0 8px 24px rgb(0 0 0 / 0.12)`).

## 5. Component inventory

| Component | Anatomy | States |
|---|---|---|
| **OpportunityCard** | kind chip, title (2 lines max), org row (16px logo, name), location chip, deadline label, tags (3 max) | default, hover, closed (title struck, `--ink-3`), urgent (deadline label in `--urgent`) |
| **DeadlineLabel** | mono text, optional dot | fixed with date, rolling, unknown, closed; urgent variant under 7 days |
| **Countdown** | mono `Xd Xh` or `Closes today`, updates once a minute, renders server-side first | normal, urgent, ended |
| **KindChip** | 12px mono uppercase, kind colour on soft background | static |
| **LocationChip** | pin icon + text | remote, city, hybrid, nationwide, global |
| **CitySelector** | button showing current city; opens a sheet on mobile, a popover on desktop; list with search | none set, set |
| **FilterBar** | horizontal scroll of chips on mobile, wrapped row on desktop; "Clear" at end | idle, active count |
| **RequirementsBlock** | heading "Requirements, as stated by <org>", `white-space: pre-line` text, 1px border | present, absent ("The source does not list requirements.") |
| **CalendarGrid** | 7-column month grid, dots by kind, selected day panel | month nav, day selected, empty day |
| **EventRow** | date block (mono day and month), title, org, venue or "Online", countdown | upcoming, today, past |
| **MapPin and cluster** | accent pin, cluster circle with count | default, selected |
| **StatusBadge** | dot + word | healthy, stale, erroring, new, disabled |
| **Button** | primary (accent bg), secondary (border), ghost | default, hover, focus, disabled, loading |
| **EmptyState** | short line, one action | per page |
| **Sheet** | bottom sheet on mobile for selectors and filters | open, closed |
| **ShareImage** | 1200×630, wordmark, kind chip, title, org, deadline | generated per opportunity |

shadcn/ui provides the primitives (Button, Popover, Sheet, Dialog, Tabs, Select). Copy them
into `apps/web/src/components/ui`, restyle with the tokens, and do not import from the
package at runtime.

## 6. Motion

- 150ms ease-out for hover and focus; 200ms for sheets and popovers; none for page loads.
- `prefers-reduced-motion` disables everything except opacity.
- No skeleton shimmer. Server-rendered pages arrive complete.

## 7. Layout patterns

- **Home:** stacked sections with `--space-7` between; grids of 1 → 2 → 3 columns at 360 → 640 → 1024.
- **Browse:** filter bar sticky under the header on desktop; results grid as above.
- **Detail:** single column, max 68ch for prose; key facts as a 2-column grid from 640px.
- **Events map:** map fills viewport minus header; list as a bottom sheet on mobile and a
  360px right panel on desktop.

## 8. Iconography and imagery

- Lucide icons, inlined SVG, 16 and 20px, `currentColor`.
- Organization logos: 32px square, from the registry `logoUrl`, lazy, with a monogram
  fallback in `--surface-2`.
- No stock imagery. No illustrations in v1.

## Acceptance

- [ ] `tokens.css` defines every token above for both themes; a visual test page `/dev/tokens` (excluded from sitemap) renders them.
- [ ] Every component in the inventory exists under `apps/web/src/components` with a Storybook-free story page `/dev/components`.
- [ ] Axe reports zero violations on `/`, `/opportunities`, `/o/[slug]`, `/events`, `/calendar`.
- [ ] Fonts: exactly two `.woff2` files served, both preloaded, `font-display: swap`, CLS 0.
