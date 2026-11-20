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
| Errors | A 404 for unknown slugs with a link to browse; a 500 that still renders the shell and a retry link (`app/error.tsx`). Never a blank page. |
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

- Stored in a cookie `prefs` as `v1.<base64url(JSON)>`, `SameSite=Lax`, `HttpOnly`, one year,
  set by a route handler `POST /api/prefs`: a plain form post that redirects back (303), so
  it works without JavaScript. It refuses a post from another site, drops values it does
  not understand, and `clear=1` removes the cookies. No account, no server-side storage.
- The handler also writes the saved city to a plain cookie `city=<slug>`. The home rewrite
  matches it with no code, so a reader with a saved city gets that city's home at `/`, and
  the header reads it to name the city. `/?city=` in the URL wins over it, and `/?city=all`
  is home with no city.
- Every preference is also readable from the query string
  (`?kinds=job,internship&city=lagos&tags=ml&remote=1`). A URL that names any preference is
  the whole feed for that request, not a mix with the cookie, so a shared link shows what
  its sender saw. A "Save as my feed" button writes it to the cookie.
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
  city gets home with no city (`/?city=all`). A reader with a saved city gets that city at
  `/` (the `city` cookie, §2); the selected pill links to `/?city=all`.
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
- "Save as my feed" when a kind, city, tag or remote filter is set (see `/feed`).

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
  listed, Deadline changes ("Moved from <date>, seen <date>", or "None recorded").
- Deadline moved: when the organisation's page moved the deadline (the engine saw a stated
  date become another), for 14 days the status word reads "Deadline moved" and the old date
  is struck through above the new one, on the page and on rows. A maintainer's correction in
  `/admin` is not a move and never shows (agreed 2026-11-20).
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

- List view: upcoming `kind = event` items ordered by `startsAt`, a band per day ("Today",
  "In 3 days", with the date); events already under way share a first band. Rows as on
  browse, with the countdown to `startsAt` ("Starts Fri"). Place pills filter by city (a
  city keeps nationwide and online events); `tags` works in the URL. "Next page" links, as
  on browse. Rendered per request.
- Map view (M4): MapLibre GL, OpenFreeMap tiles, one pin per geocoded event, clustered; a
  side panel lists events in the current viewport; selecting a pin opens a panel with a
  countdown and a link. City selector recenters. Non-geocoded events show in the list with a
  "no map location" note.

### `/calendar` Calendar

Visual reference: Claude Design boards "Calendar · mobile" and "Calendar · desktop month".

- `?month=2026-10`, `kinds`, `city`, `tags`. Every control is a link, so month navigation
  needs no JavaScript and the URL is the state. Rendered per request. A month that is past,
  more than 18 months ahead or not understood shows the current month; the current month
  has no "previous" link, since nothing open lies in the past.
- Open items only: a deadline on the day it closes, an event on the day it starts. Items
  with no stated date, rolling applications included, are left out; the page says so and
  links to browse.
- On a phone: the month as a list of the days that have something, today always shown,
  each row with the time (or "No time"), kind, Closes or Starts, title, organisation and
  place.
- From 1024px: a month grid, weeks from Monday. Each item is a link in its day's cell,
  tinted by kind family, with a dot coloured by urgency (`07` §3) and the time when the
  source gave one. There is no day panel; a busy day's cell grows.
- Kind family chips on both sizes.
- "Subscribe" jumps to a section with the feed address for the current filters
  (`/calendar.ics?kinds=&city=`) as text to copy, an "Open in your calendar app" link
  (`webcal:`) and "Download once".
- `/calendar.ics`: every open dated item from today on, one event each as on
  `/o/[slug]/calendar.ics` but with no reminders. Calendar apps are asked to re-read it
  every six hours.

### `/feed` My feed

- If no preferences and no query: a form (kinds as checkboxes under the five families, a
  city drop-down, "Remote only", topic tags) that posts to `/api/prefs` and redirects back.
  Nothing ticked is a feed of everything.
- Otherwise: the feed query above under two bands, "Closing in the next 14 days" (soonest
  first) and "Everything else" (newest first), with a one-line summary of the preferences,
  an "Edit" link (the same form, filled in, with "Clear"), "Next page" links, and "Share
  this feed": the query-string address as text to copy and a "Share on WhatsApp" link.
- A feed from a URL is headed "A shared feed" and offers "Save as my feed".
- Rendered per request and `noindex`: it is the one public page that reads a cookie.
- "Save as my feed" on `/opportunities` saves the kinds, city, tags and remote filter in
  force; search text, organisation and closing-within are not preferences.
- The header's city pill says "Choose city" in the HTML and names the saved city once the
  page has loaded; it links to the form.

### `/status` Status

Visual reference: Claude Design board "Status · normal and degraded". The page has two
layers: the board's, for a reader asking whether the data is fresh, and a table for
contributors asking which source is broken.

- Top: the date, a headline ("Normal operations", or "2 sources need attention"), one
  sentence, and three counts: On time, Late, Failing. These go by the time since a source's
  last good read: Late after 8 hours (not the 6 between runs, since scheduled runs often
  start late), Failing after 24, or at once when the engine marks the source erroring. A
  source not yet read is "New"; disabled sources and those entered by hand are left out.
- Sources: each with its organisation, site and last read, worst first: all that need
  attention, then up to seven on time, then a link to the full table.
- How this works: the rules in words; counts of organizations, sources, open opportunities
  and items published this week; when the engine last ran; "Report a problem on GitHub".
- For contributors: every source with organization (linked to its registry file), source
  key, kind, last good read, last new item, consecutive empty runs and the engine's state
  (`04` §7, the same one `engine health` prints). Sorted worst first. The intro says this is
  the good-first-issue list.
- Coverage benchmark: a manually maintained list (M5) of items the weekly check found on
  YouthOp or Opportunity Desk that we missed, with a link to the fix PR when done.

### `/submit` Submit (M4)

- Fields: URL (required), note (optional), your name or handle (optional). Honeypot field.
  Rate limit 5 per IP per hour. Writes a `Submission`. Confirmation page says what happens
  next and that we never assert eligibility.

### `/about`, `/api` (docs), `/contribute`

Static content pages. `/about`: what is listed, where it comes from, what the site never does
(decide who can apply, guess a date, ask for money or a login, track readers), how to report
a mistake, and that the code and registry are open. `/contribute`: the reader's version of
`CONTRIBUTING.md`. `/api` embeds the OpenAPI document with a lightweight renderer (M4.5);
until then the footer's "API" link opens `/api/v1/openapi.json`.

## 4. Admin (`/admin`, maintainer only)

- `/admin/login`: token form; sets the signed cookie (`02` §7). "Log out" clears it.
- `/admin`: review queue. Tabs: Opportunities in review (sorted by confidence asc), Submissions
  (new), Duplicates suggested (pairs sharing an `identityKey`), Sources erroring, and All
  (every opportunity in any status, searchable by title, organization and URL, with filters
  for status, kind and organization, so a published item can be found and corrected). The
  tab, search, filters and page are in the URL; an item link carries that URL, so an action
  returns to the same view. In review also lists reviewed items whose source page now
  states a different deadline: they stay live with the maintainer's deadline, the item page
  says what the source states, and saving clears the flag. Duplicates lists groups of live items (in review, published or
  closed, not already marked) sharing an `identityKey`. Sources erroring lists erroring and
  stale sources with the last failed read's status and message, linked to the registry
  file.
- `/admin/new`: create an opportunity by hand, for `manual` sources and anything the engine
  missed, for any organization in the registry. Two steps, so the check comes before saving
  and works without JavaScript. Step one asks for the organization, the page address and
  the title: a row with the same `canonicalUrl` is shown with "Open existing" and creation
  is refused; rows with the same `identityKey` are shown with "Open existing" first and "This
  is a different opportunity. Continue." second. Step two is the review form's fields
  without the source-text pane. The identity key and slug are computed by the same code as
  the engine's loader (`@devspot/schema` and `@devspot/db`). A deadline
  is entered only as the organization's page states it; the field defaults to `unknown`. The
  row gets `discoveredVia = manual`, `extractionMethod = manual`, `confidence = 1`,
  `rawItemId = null`, and `reviewedAt`; Publish and Save without publishing work as below.
- Review item view: left, the source text (`RawItem.text`) with dates and place words marked
  as a reading aid, and the item's history; right, an editable form of the `Opportunity`
  fields with the extractor's confidence beside each. The organization and canonical URL are
  fixed. Dates are entered as the source states them, in Lagos time, with the time left empty
  unless the source gives one; a date is accepted only with a `fixed` or `multiRound`
  deadline. Actions: Publish, Publish and next (opens the next item in review), Save
  without publishing, Reject (with reason), and Mark duplicate of: a search by title or
  address listing up to ten other live rows, each with its own button. Marking a duplicate
  sets `duplicateOfId`, moves the item to `rejected` with the reason "Duplicate of <title>",
  and so takes a published copy off the site (invariant 6). The original may not itself be
  a duplicate, so there are no loops. Publishing needs
  a kind and a location mode and sets `reviewedAt` and `publishedAt`; any edit sets
  `extractionMethod = manual`. On a published item, Publish reads "Save changes" and Reject
  reads "Unpublish" (back to `review`). A published item links to "View on site".
- Every action is a server action that checks the session itself, behind the proxy. It
  writes a row to `opportunity_events` in the same transaction as the change (ADR 0016: the
  durable record, since Vercel keeps logs for about an hour), logs a JSON line to the
  console, and refreshes the public pages.

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
| Client JS on `/`, `/opportunities`, `/o/[slug]` | under 150 KB gzipped for a modern browser (the `noModule` polyfills for old browsers are not counted), of which our own client code is under 20 KB. Measured 2026-11-20 on the live site: about 139 KB, of which Next.js and React are about 128 KB and ours about 11 KB, so the earlier 90 KB could not be met without leaving Next.js (agreed 2026-11-20) |
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
