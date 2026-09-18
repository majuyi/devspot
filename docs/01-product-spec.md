# 01 · Product specification

> **What Opus needs to know.** One Next.js app with nine public routes, one maintainer route
> group, and one API. Every public page is server-rendered, readable without JavaScript,
> mobile-first at 360px, and shows requirements verbatim. Filters are URL-encoded so every view
> is shareable. Preferences for `/feed` live in a cookie and can be expressed as query params.
> Reader-facing copy never says someone is eligible and never guesses a date.

## 1. Global rules

| Rule | Detail |
|---|---|
| Rendering | Server Components by default. Client components only for the city selector, filter chips, calendar navigation, countdown, map and the admin queue. |
| Caching | Public pages use ISR, `revalidate = 900`. The engine calls `POST /api/revalidate` after each run to refresh sooner. |
| URLs | Lowercase, hyphenated slugs. Opportunity slug: `<org-slug>-<title-slug>-<yy>` (year of first sighting), deduplicated with a short suffix on collision. Never changes once published. |
| Dates | Displayed in West Africa Time with the day of week, e.g. `Fri 3 Oct 2026`. Relative labels: `Closes today`, `Closes in 3 days`, `Closed`. Times shown only when the source gives one. |
| Deadlines | `fixed`: date shown. `rolling`: "Rolling applications". `multiRound`: "Multiple rounds, next: <date>" when known. `unknown`: "Deadline not stated on the source page". Never invent one. |
| Requirements | `requirementsText` rendered unmodified in a bordered block titled "Requirements, as stated by <org>". No badge, chip or copy anywhere implies eligibility. |
| Location | Chip shows one of `Remote`, `<City>`, `<City> · Hybrid`, `Nigeria` (nationwide), `Global`. Remote items never claim a city. |
| Empty states | Always explain and offer one action: widen the filter, pick another city, view all. |
| Errors | A 404 for unknown slugs with a link to browse; a 500 that still renders the shell and a retry link. Never a blank page. |
| Sharing | Every opportunity and organization page has Open Graph and Twitter card tags, an `og:image` generated per opportunity (title, org, deadline, kind), and `application/ld+json` (`JobPosting` for jobs and internships, `Event` for events, `Article` otherwise). |
| Accessibility | WCAG AA contrast, visible focus rings, landmark regions, `aria-live` for filter result counts, all icons labelled. |
| Analytics | None in v1. `/status` is the only telemetry. |

## 2. Preferences model (`/feed`)

```ts
type Preferences = {
  v: 1;
  kinds: OpportunityKind[];      // empty means all
  city?: CitySlug;               // undefined means no city preference
  tags: string[];                // empty means all
  remoteOnly?: boolean;
};
```

- Stored in a cookie `prefs` as `v1.<base64url(JSON)>`, `SameSite=Lax`, one year, set by a
  route handler `POST /api/prefs`. No account, no server-side storage.
- Every preference is also readable from the query string (`?kinds=job,internship&city=lagos`),
  which takes precedence over the cookie for that request. A "Save these as my feed" button
  writes the query to the cookie.
- **Feed query.** Published and not closed; `kind IN kinds` (or any); tag overlap when tags set;
  location: `locationMode = remote` OR (`country = 'NG'` AND (`city IS NULL` OR `city = pref.city`));
  with `remoteOnly`, remote only. Order: items with a fixed deadline in the next 14 days first
  by deadline, then the rest by `publishedAt` desc. Page size 30, cursor pagination.

## 3. Routes

### `/` Home

- Header: wordmark, primary nav (Opportunities, Events, Calendar, Organizations), city
  selector (client, writes `prefs.city`), search field (submits to `/opportunities?q=`).
- Hero, compact: one sentence of promise, one line stating the count of open opportunities
  and organizations tracked (live numbers), primary button "Browse", secondary "Set up my feed".
- "Closing this week": horizontal list of up to 8 published items with `deadlineAt` in the
  next 7 days, sorted ascending. Hidden when empty.
- "New this week": grid of up to 9 items by `publishedAt` desc.
- "Near you": when `prefs.city` is set, up to 6 items where `city = prefs.city` (events and
  onsite roles). Otherwise a prompt to choose a city.
- Kind tiles: one per kind with the live open count, linking to the filtered browse page.
- Footer: about, contribute (GitHub), status, API, licence.

### `/opportunities` Browse

- Query params: `q`, `kinds` (csv), `city`, `remote` (`1`), `tags` (csv), `org`,
  `closing` (`7`|`30`), `sort` (`deadline`|`new`), `cursor`.
- Filter bar (client): kind chips, city select, remote toggle, closing-within select, tag
  chips (top 12 by frequency), clear all. Every change updates the URL and re-fetches via
  navigation, not client state.
- Result count and a "Save as my feed" button when any filter is active.
- Card (shared component): kind chip, title, organization name with logo, location chip,
  deadline label with urgency color when 7 days or fewer, up to 3 tags. Whole card is the link.
- Server query mirrors the feed query without preferences. Search uses Postgres
  `to_tsvector('english', title || ' ' || coalesce(summary,''))` with `plainto_tsquery`.
- Pagination: "Load more" that appends and updates `cursor` in the URL.

### `/o/[slug]` Opportunity

- Breadcrumb: Opportunities › Kind.
- Title, organization line (logo, name, link to `/org/[slug]`), kind and location chips.
- Key facts grid: Deadline (per deadline rules, with a countdown when fixed and within 30
  days), Opens (if `opensAt`), Dates (events: `startsAt` to `endsAt`, venue), Location,
  Discovered (date first seen), Verified (date last verified).
- Primary action "Apply on <host>" linking to `applyUrl ?? canonicalUrl`, `rel="noopener"`,
  opens a new tab. Secondary: "Share" (Web Share API, falls back to copy link), "Add to
  calendar" (`.ics` download from `/o/[slug]/calendar.ics`).
- Summary paragraph (`summary`), then the Requirements block (verbatim), then "Source"
  showing the canonical URL and the organization's source page.
- For `closed`: a banner "Applications closed on <date>" and the page remains indexable.
- For `review`: 404 to the public; visible only in `/admin`.
- Related: up to 4 other open items from the same organization, then 4 of the same kind in
  the same city.
- JSON-LD as per global rules. `og:image` route at `/o/[slug]/opengraph-image`.

### `/org` and `/org/[slug]` Organizations

- Index: all enabled organizations grouped by category, each with open count and a health dot
  (green: yielded in the last 30 days; grey: no yield yet; amber: stale; red: erroring).
- Detail: name, description, homepage, category, base city; "Open now" list; "Past" list
  (closed, paginated); "How we track this organization": each source with kind, URL, last
  successful run, and a link to the registry file on GitHub ("Improve this entry").

### `/events` Events

- List view: upcoming `kind = event` items ordered by `startsAt`, grouped by day. Filter by city
  and tags. Each row: date block, title, organization, venue or "Online", countdown chip.
- Map view (M4): MapLibre GL, OpenFreeMap tiles, one pin per geocoded event, clustered; a
  side panel lists events in the current viewport; selecting a pin opens a card with a
  countdown and a link. City selector recenters. Non-geocoded events show in the list with a
  "no map location" note.

### `/calendar` Calendar

- Month grid (client for navigation, server-rendered for the initial month) showing deadlines
  and event start dates as dots colored by kind; day panel lists the items. Week list view for
  mobile. `?month=2026-10`. Jobs with rolling deadlines are excluded; the page says so.
- "Subscribe" gives an `.ics` feed URL (`/calendar.ics?kinds=&city=`) that reflects filters.

### `/feed` My feed

- If no preferences and no query: an onboarding form (kinds, city, tags, remote only) that
  posts to `/api/prefs` and redirects back.
- Otherwise: the feed query above, with a compact header summarizing the preferences and an
  "Edit" link, and a "Share this feed" that copies the query-string form of the URL.

### `/status` Status

- Last engine run time and result. Counts: organizations, sources, open opportunities,
  published this week.
- Source health table: organization, source, kind, last OK, last yield, consecutive empty,
  state. Sorted worst first. Each row links to the registry file. The intro text says this is
  the good-first-issue list.
- Coverage benchmark: a manually maintained list (M5) of items the weekly check found on
  YouthOp or Opportunity Desk that we missed, with a link to the fix PR when done.

### `/submit` Submit (M4)

- Fields: URL (required), note (optional), your name or handle (optional). Honeypot field.
  Rate limit 5 per IP per hour. Writes a `Submission`. Confirmation page says what happens
  next and that we never assert eligibility.

### `/about`, `/api` (docs), `/contribute`

Static content pages. `/api` embeds the OpenAPI document with a lightweight renderer.

## 4. Admin (`/admin`, maintainer only)

- `/admin/login`: token form; sets the signed cookie.
- `/admin`: review queue. Tabs: Opportunities in review (sorted by confidence asc), Submissions
  (new), Duplicates suggested (pairs sharing an `identityKey`), Sources erroring.
- Review item view: left, the source text (`RawItem.text`) with highlights for matched dates
  and location words; right, an editable form of every `Opportunity` field with its
  confidence. Actions: Publish, Reject (with reason), Mark duplicate of (search), Save
  without publishing. Publishing sets `reviewedAt`, `publishedAt`, `extractionMethod = manual`
  when any field was edited.
- Every action is a server action guarded by the admin middleware and logged to the console
  in JSON (Vercel logs are the audit trail in v1).

## 5. API surface

Specified in `docs/06-api-spec.md`. In short: `GET /api/v1/opportunities`,
`GET /api/v1/opportunities/{slug}`, `GET /api/v1/organizations`,
`GET /api/v1/organizations/{slug}`, `GET /api/v1/events`, `GET /api/v1/meta`,
`GET /api/v1/openapi.json`, plus internal `POST /api/revalidate` and `POST /api/prefs`.

## 6. Performance budget

| Metric | Budget |
|---|---|
| Lighthouse mobile (all public routes) | Performance 95+, Accessibility 100, SEO 100 |
| LCP on 4G, mid-range Android | under 2.5s |
| Client JS on `/`, `/opportunities`, `/o/[slug]` | under 90 KB gzipped, excluding the map route |
| CLS | 0 |
| Fonts | two files, self-hosted, `font-display: swap`, metrics-matched fallback |

## 7. Copy rules

- Plain English. Short sentences. No exclamation marks.
- Never "you qualify", "eligible for you", "perfect for you". Use "as stated by <org>".
- Dates always carry the year. Money always carries the currency.
- The product speaks in the first person plural sparingly and never about itself in the third
  person.

## Acceptance

- [ ] Every route in section 3 exists, renders without JavaScript, and meets the performance budget.
- [ ] A filtered browse URL pasted into a new browser reproduces the same view.
- [ ] `/feed` with `?city=lagos&kinds=event` shows only Lagos or remote events.
- [ ] Sharing an opportunity URL on WhatsApp shows the generated image, title and deadline.
- [ ] Grep of `apps/web` for "eligible" finds only the verbatim-requirements heading.
- [ ] `/admin` is inaccessible without the cookie, including `/api/admin/*`.
