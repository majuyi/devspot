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
| Caching | Public pages use ISR, `revalidate = 900`. The engine calls `POST /api/revalidate` after each run to refresh sooner. `/opportunities` reads its filters from the query, so it is rendered per request. |
| URLs | Lowercase, hyphenated slugs. Opportunity slug: `<org-slug>-<title-slug>-<yy>` (year of first sighting), deduplicated with a short suffix on collision. Never changes once published. |
| Dates | Displayed in West Africa Time with the day of week, e.g. `Fri 3 Oct 2026`. Status words and the countdown format are in `07` §5 and §6 (`Closes today`, `Closes Sat`, `27h` / `14m`). Times shown only when the source gives one. |
| Deadlines | `fixed`: date shown. `rolling`: "Rolling applications". `multiRound`: "Multiple rounds, next: <date>" when known. `unknown`: "Deadline not stated on the source page". Never invent one. |
| Requirements | `requirementsText` rendered unmodified, with its own line breaks and never split into bullets, under the heading "Requirements" and the line "As stated by <org>", followed by "devspot does not check who can apply. Read the source page before you apply." No badge, chip or copy anywhere implies eligibility. |
| Location | Place text shows one of `Remote`, `<City>`, `<City> · Hybrid`, `Nigeria` (nationwide), `Global`. Remote items never claim a city. |
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
  with no city preference, `locationMode = remote` OR `country = 'NG'` (every Nigerian city);
  with `remoteOnly`, remote only. Order: items with a fixed deadline in the next 14 days first
  by deadline, then the rest by `publishedAt` desc. Page size 30, cursor pagination.

## 3. Routes

### `/` Home

Visual reference: Claude Design board "D · Map band + board" (artifact
`3FkdJXB4RxEPKtbrbu7V8W`, agreed 2026-11-11), in light and dark at 360px.

- Header: wordmark; city pill ("Choose city", or the city name) linking to the city list
  and writing `prefs.city`; a 44px search button linking to `/opportunities` with the search
  field focused. Below, a scrolling nav row: Opportunities, Events, Calendar, Organisations.
- Map band on `sea`: the static Nigeria map (dot per city, size by open count, colour by the
  most urgent item there) beside three linked figures in the `countdown` style, each with an
  urgency tick: open (faint), closing this week (amber), in 48 hours (red). Under it, place
  pills for Remote and each city with open items, with counts, most first; a city pill links
  to `/?city=<slug>` (the selected one back to `/`), and Remote, which is not a city, to
  `/opportunities?remote=1`. The figures link to browse (`closing=7`, `closing=2`). The map
  is an image with a text label, not a control: the pills are its links. A place is red when
  anything there closes within 48 hours or today, amber when anything closes or an event
  starts within 7 days. Dot radius is `4 + 5 × √count`, at most 20. From 1024px the band is
  a card at the top of the right column. No hero sentence, no buttons.
- Sheet over the band (`radius-sheet`, overlapping by 18px). Kind family chips: All, Work,
  Build, Events, Funding, Programmes, as links to `/opportunities?kinds=<the family's kinds>`.
- "Closing soon", with "All N open" linking to browse, and a freshness line under the
  heading ("All 23 sources read in the last 6 hours. Status", from `FetchRun`). Published,
  not-closed, non-event items with a fixed deadline, as DatedRows grouped Today, Tomorrow,
  This week, Later. Today, Tomorrow and This week are never capped; Later shows 5, then
  "N more open" linking to browse.
- "Starting soon", with "All N events" linking to `/events`: the next 4 events by `startsAt`, grouped
  This week and Later; the countdown shows days only and the status word is "Starts Fri" or
  "Scheduled".
- "New this week", with "See all": up to 9 items published in the last 7 days, by
  `publishedAt` desc. Items without a fixed deadline show as UndatedRows (monogram or logo
  tile, deadline wording in place of the date).
- "Near you": with no city, one line asking the reader to pick a place in the row under the
  map ("Remote items are listed for everyone"). With a city (query or `prefs.city`), up to 3
  items in that city or nationwide, then "N more in <City>" linking to
  `/opportunities?city=`, and "Change city". The city selects this section and the pill;
  "Closing soon" and "Starting soon" stay national plus remote. `/?city=<slug>` is rewritten
  to a cached page per city (`/in/<slug>`), so home is never rendered per request; an unknown
  city gets plain home. Reading `prefs.city` arrives with the cookie in M2.8.
- Footer: wordmark, one paragraph (read from each organisation's own page every six hours;
  requirements as stated by each organisation; devspot does not check who can apply),
  links About, Contribute on GitHub, Status, API, Licence, Calendar feed, and "All times in
  West Africa Time (WAT)".

### `/opportunities` Browse

Visual reference: Claude Design board "Filtered list · results and empty".

- Query params: `q`, `kinds` (csv), `city`, `remote` (`1`), `tags` (csv), `org`,
  `closing` (`2`|`7`|`30` days), `sort` (`deadline`|`new`), `status` (`all` lists closed
  items too), `cursor`. A value that is not understood is ignored, never an error.
- Title and subtitle say what is listed: "Build", "Hackathons and competitions · 5 open".
- Filters, all links or a GET form (no JS needed): a search field; kind family chips (one
  family at a time, the selected chip clears it); place pills (All places, Remote, each city
  with open items, with counts); "Clear all" when any filter is set. `tags`, `org`, `closing`
  and `sort` have no control on the page but work in the URL.
- A city lists what a reader there can take up: items in the city, nationwide and remote
  (as in §2), and the subtitle says so.
- Results as rows (`07` §5): with `sort=deadline`, DatedRows in bands Today, Tomorrow, This
  week, Later, then the undated rows under "No closing date"; a list of only events is
  ordered and banded by start. With `sort=new`, rows by `publishedAt` with no bands. Every row
  shows the source domain, "checked <relative time>" from `lastVerifiedAt`, and an
  add-to-calendar button for dated items (`/o/[slug]/calendar.ics`).
- Under the list: "Showing 30 of 120. Closed items are hidden. Show closed".
- An empty result says what was asked for and links to wider views.
- Server query mirrors the feed query without preferences. Search uses Postgres
  `to_tsvector('english', title || ' ' || coalesce(summary,''))` with `plainto_tsquery`.
- Pagination: 30 rows, then a "Next page" link carrying `cursor`. A link, not an appending
  button, so it works without JavaScript. Pages after the first are `noindex`.
- "Save as my feed" arrives with `POST /api/prefs` in M2.8.

### `/o/[slug]` Opportunity

Visual reference: Claude Design boards "Opportunity page" and "Opportunity page · desktop".
On a phone the order is as below; from 1024px the deadline, actions and source sit in a
column on the right.

- Back link to the kind's family on browse ("← Build"). A fixed link: the page is cached
  and cannot know where the reader came from.
- For `closed`: a banner "Applications closed on <date>"; the page remains indexable.
- Kind tag and status word, the title, then the organisation (link to `/org/[slug]`) and
  place.
- Deadline section. Dated: "Closes · <date>" (or "Starts", or "Multiple rounds, next"), then
  a large figure, the time when the source gave one and otherwise the day, then
  "In 27h 14m" within 30 days. Undated: the deadline wording from §1 and one line saying
  the page is checked every six hours. Under it, when the source gives them: Opens, and for
  events Ends, Venue and the event's own deadline.
- Primary action "Apply on <host>" ("View on <host>" for events and closed items) linking
  to `applyUrl ?? canonicalUrl`, `rel="noopener"`, in a new tab. Secondary: "Add to calendar"
  for dated open items (`/o/[slug]/calendar.ics`) and "Share on WhatsApp", a plain link.
  Then: "You apply on <host>, not here. devspot never asks for money, documents or a login."
- "Where this came from": Source (the canonical URL's host, linked), Last checked, First
  listed. A "Deadline changes" row, and the old date struck through above a moved deadline,
  need a deadline history (the proposed `opportunity_events` table) and ship once that is
  agreed and built.
- Requirements (per §1), then "About" (`summary`, when there is one).
- Related: "More from <org>", up to 4 other open items from the same organization, then
  "More <kind> in <city>", up to 4 of the same kind in the same city.
- "Something wrong? Report this listing" opens a pre-filled GitHub issue until `/submit`
  exists (M4).
- For `review` and unknown slugs: a 404 page linking to browse; visible only in `/admin`.
- JSON-LD as per global rules. `og:image` route at `/o/[slug]/opengraph-image` (board
  "Share image", light theme), cached like the page.
- `/o/[slug]/calendar.ics`: one event with a reminder the day before. A deadline with a
  time is the hour ending at the deadline; with only a date it is an all-day entry. An
  event keeps its own start and end. 404 when there is no date.

### `/org` and `/org/[slug]` Organizations

- Index: all enabled organizations grouped by category in a fixed order (employers first; an
  empty category is left out), within a category most open items first, then by name. Each
  row has the open count and a health badge (`07` §5 StatusBadge: Healthy, New, Stale in
  amber, Erroring in red; a dot and a word, never green). An organization with several
  sources shows its worst one.
- Detail: name, category, base city, health, description, homepage; "Open now" (up to 30,
  in deadline bands, then a link to browse for the organization); "Past" (the 10 most
  recently closed, then a link to browse with closed items shown, so the page stays cached);
  "How we track this organisation": each source with how it is read, its URL, last
  successful read and health, and a link to the registry file on GitHub ("Improve this
  entry"). A disabled or unknown organization is a 404.

### `/events` Events

- List view: upcoming `kind = event` items ordered by `startsAt`, grouped by day. Filter by city
  and tags. Rows as on browse, grouped by day, with the countdown to `startsAt` ("Starts Fri").
- Map view (M4): MapLibre GL, OpenFreeMap tiles, one pin per geocoded event, clustered; a
  side panel lists events in the current viewport; selecting a pin opens a panel with a
  countdown and a link. City selector recenters. Non-geocoded events show in the list with a
  "no map location" note.

### `/calendar` Calendar

- Month grid (client for navigation, server-rendered for the initial month) showing deadlines
  and event start dates as dots coloured by urgency (`07` §3, never by kind); day panel lists the items. Week list view for
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
  (new), Duplicates suggested (pairs sharing an `identityKey`), Sources erroring, and All
  (every opportunity in any status, searchable by title, organization and URL, so a published
  item can be found and corrected).
- `/admin/new`: create an opportunity by hand, for `manual` sources and anything the engine
  missed. The same form as the review item view, without the source-text pane; the
  organization is chosen from the registry. Before saving, an existing row with the same
  `canonicalUrl` or `identityKey` is shown and the action becomes "Open existing". A deadline
  is entered only as the organization's page states it; the field defaults to `unknown`. The
  row gets `discoveredVia = manual`, `extractionMethod = manual`, `confidence = 1`,
  `rawItemId = null`, and `reviewedAt`; Publish and Save without publishing work as below.
- Review item view: left, the source text (`RawItem.text`) with highlights for matched dates
  and location words; right, an editable form of every `Opportunity` field with its
  confidence. Actions: Publish, Reject (with reason), Mark duplicate of (search), Save
  without publishing. Publishing sets `reviewedAt`, `publishedAt`, `extractionMethod = manual`
  when any field was edited. On a published item, Publish reads "Save changes" and Reject
  reads "Unpublish" (back to `review`).
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
- [ ] An opportunity created at `/admin/new` for a `manual` source publishes and appears on `/` and `/org/[slug]`; a second one with the same `canonicalUrl` is refused with a link to the first.
- [ ] A published opportunity can be found from the All tab and its deadline corrected.
