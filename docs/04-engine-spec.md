# 04 · Engine specification

> **What Opus needs to know.** `packages/engine` is a CLI (`pnpm engine <command>`) that runs
> seven pure stages over a list of sources and writes results through one loader. Fetchers and
> adapters return values and never touch the database. Every source has a recorded HTTP
> fixture and a golden output; the test suite runs with the network hard-disabled. Health is
> computed after every run and written to `Source`. The whole engine runs in one GitHub Actions
> job every six hours.

## 1. Stages and contracts

Types come from `@devspot/schema`. Each stage is a function in its own file with unit tests.

```
sources: Source[]
   │
   ▼  fetch(source, http): Promise<FetchResult>        // stage 1
   │     FetchResult = { items: RawItemInput[], httpStatus?: number, validators?: Validators, error?: string }
   ▼  dedupe(source, items, db): Promise<DedupeResult> // stage 2
   │     DedupeResult = { newItems: RawItem[], changedItems: RawItem[], unchanged: number }
   ▼  extract(rawItem, org, opts): Promise<OpportunityDraft>   // stage 3 (rules, then optional llm)
   ▼  validate(draft): Result<OpportunityInput, ZodError>      // stage 4
   ▼  load(input, ctx): Promise<{ id, status, created: boolean }> // stage 5, the only DB writer
   ▼  verify(opportunity, http): Promise<VerifyResult>         // stage 6, separate command
   ▼  health(source, run): SourceHealthUpdate                  // stage 7
```

### Stage 1 · Fetch

Dispatch on `Source.kind`:

| kind | Implementation | Produces one RawItemInput per |
|---|---|---|
| `feed` | `fetchers/feed.ts`: GET with conditional headers (`If-None-Match`, `If-Modified-Since` from `Source.etag` and `Source.lastModified`), parse with feedsmith, map entries | feed entry, text = entry content or summary, stripped of HTML |
| `sitemap` | `fetchers/sitemap.ts`: GET sitemap or sitemap index, keep URLs matching the source's `include` glob, diff against known `RawItem.canonicalUrl`, fetch only new URLs, extract readable text with a Readability-style extractor | new URL |
| `html` | `fetchers/html.ts` looks up `Source.adapter` in `adapters/index.ts` and calls `adapter.fetch(source, http)` | whatever the adapter returns |
| `api` | same as `html` with a JSON-speaking adapter | same |
| `manual` | no-op; items arrive through `/admin/new` (M2.10) or `/submit` (M4.3) | never |

`http` is `HttpClient` in `src/http.ts`, an undici `Dispatcher`-backed wrapper with: one
request per second per host (or the host's `Crawl-delay` when longer), a 20s timeout, 3
retries with jitter on 5xx and network errors (timeouts included), no retry on 4xx, a fixed
`User-Agent: devspot-bot/0.1 (+https://github.com/majuyi/devspot)` (the contact URL becomes
`https://<site>/about#bot` when the site ships in M2.12), and `robots.txt` checked and cached
per host for 24 hours, matched against the `devspot-bot` group. Per RFC 9309, a 4xx
`robots.txt` means no rules and a 5xx or unreachable one means disallow everything. Redirects
are followed (5 hops) with `robots.txt` checked on every hop. A disallowed path raises
`RobotsDisallowed` and the run records it. `get` returns any status, so the feed fetcher can
read a 304; `text` and `json` throw `HttpStatusError` on non-2xx and `HttpRequestFailed` when
retries run out.

The feed fetcher (built in M1.3) takes the source's last `validators` (`etag`, `lastModified`)
and sends them as `If-None-Match` and `If-Modified-Since`. A 304 returns no items, the same
validators and `httpStatus: 304`; a 200 returns the response's validators for the caller to
store. feedsmith 2.x reads RSS 2.0, Atom, RDF and JSON Feed. Per entry:

- `url`: the entry's link (Atom: the `alternate` link), else an RSS `guid` or Atom `id`
  that is itself an absolute http(s) URL. Entries without one are dropped.
- `text`: `content:encoded`, Atom `content` or JSON `content_html`, falling back to the
  summary or description, then the title. HTML becomes plain text with one blank line
  between blocks (paragraphs, headings), list items as `- ` lines and `<br>` as a newline,
  because the rules extractor reads "first paragraph" and "the block under a Requirements
  heading" from that structure. Scripts, styles and images are dropped. WordPress's "The
  post … appeared first on …" trailer is removed.
- `meta.links`: `{ text, href }` for every link in the content, resolved and deduplicated,
  for the `applyUrl` rule (`05` §2). A textless link that wraps only an image is dropped.
  `meta.categories`: the entry's categories or tags.
- `publishedAt`: `pubDate`, Atom `published` (else `updated`) or JSON `date_published`, as
  ISO 8601 UTC; an unparseable date is left out rather than guessed.

The sitemap fetcher (built in M1.4) reads a `<urlset>`, or a `<sitemapindex>` one level
down (at most 10 children; point the source at the child sitemap when an index is bigger).
It keeps URLs that match the source's `include` glob, matched against the whole URL (`*`
stays within a path segment, `**` crosses segments, `?` is one character), and drops those
in `knownUrls`, which the caller loads from the source's `RawItem.canonicalUrl` because
fetchers never read the database. It fetches the 20 newest by `<lastmod>`; the rest wait for
the next run. Each page goes through Readability (navigation, footers and asides removed
first; the whole body if Readability finds no article) and then the same HTML-to-text as
feeds, so `text` and `meta.links` have one shape. `meta.lastmod` keeps the sitemap date;
`publishedAt` is set only from the page's own published-time metadata. A page that returns
an HTTP error or that `robots.txt` disallows is skipped and named in `FetchResult.error`.

### Adapter contract

```ts
// packages/engine/src/adapters/<org-slug>.ts
import type { Adapter } from "../adapter";

const adapter: Adapter = {
  key: "hng",                                   // matches Source.adapter
  async fetch(source, http) {
    const html = await http.text(source.url);
    // ...cheerio...
    return [{ url, title, text, publishedAt, meta }];
  },
};
export default adapter;
```

Rules for adapters: return every currently listed item, do not filter by date, do not
extract structure beyond `title`, `text`, `publishedAt` and `meta`, do not import `db`, do
not call the LLM. One file per organization. A recorded fixture is part of the definition of
done.

Built in M1.5. Each adapter is listed in `adapters/index.ts`, a static map, so a missing
import fails the build rather than a run. `fetchers/html.ts` checks every returned item
against `RawItemInput` and throws `AdapterOutputInvalid` naming the item and field; a
registry `adapter` with no entry throws `AdapterNotFound`. An adapter that cannot find what
it reads (no container, a changed API shape) throws `AdapterLayoutChanged` rather than
returning nothing, so `/status` shows a broken source instead of a quiet one. When the
listing gives more than a title, `text` is built from its fields; fields that change every
day (time left, registration counts) stay out of `text` so the content hash moves only when
the opportunity does.

An adapter that needs a request per item does what the sitemap fetcher does: it skips
`knownUrls` and fetches a capped number of new items per run. The devpost adapter lists open
and upcoming online hackathons, then opens at most 10 new ones for the deadline line (with
its time zone) and "Who can participate", country exclusions spelled out from the tooltip or
the modal that holds them.

### Stage 2 · Dedupe

- Canonicalize URL: lowercase host, strip `utm_*`, `fbclid`, `ref`, trailing slash, fragment;
  keep the query otherwise.
- `contentHash = sha256(normalize(text))` where normalize collapses whitespace and strips
  dates in "last updated" patterns.
- Upsert `RawItem` by `(sourceId, canonicalUrl)`: new → create; same hash → bump
  `lastSeenAt`, `seenCount`; different hash → update text and hash and mark changed.
- Output: new and changed items only. Unchanged items cost nothing downstream.

Built in M1.6: `src/dedupe.ts` (pure: `canonicalizeUrl`, `normalizeText`, `contentHash`) and
`src/raw-items.ts` (`upsertRawItems(db, sourceId, items)`, one transaction per batch).
Tracking parameters are matched case-insensitively (`utm_*`, `fbclid`, `ref`; not
`referrer`), and the rest of the query is kept byte for byte, order included. Items in one
batch that share a canonical URL collapse to the first. "Last updated" means the labels
*last updated*, *last modified*, *last reviewed*, *updated on* and *page updated* followed
by a date within 30 characters; a deadline sentence is never touched. On a changed hash,
title, text, meta and `publishedAt` are all replaced; on the same hash, none of them are,
even if the title moved. The result is `{ found, fresh: [{ status, rawItem }], unchanged }`,
which M1.10 turns into `FetchRun.nFound`, `nNew` and `nChanged`. The sitemap fetcher
canonicalizes sitemap URLs before checking them against `knownUrls`, which hold canonical
URLs.

### Stage 3 · Extract

See `docs/05-extraction-spec.md`. Rules always run. LLM runs when `EXTRACTION_LLM=1` and the
budget allows. Output is an `OpportunityDraft` with `fieldConfidence`.

### Stage 4 · Validate

`OpportunityInput.safeParse` with the organization context merged in. Failures are logged
with the field path and counted on the run; they never throw.

### Stage 5 · Load

- Compute `identityKey = slugify(org.slug + " " + normalizeTitle(title) + " " + cycleYear)`,
  where `normalizeTitle` strips years, cohort numbers and punctuation, and `cycleYear` is the
  year of `deadlineAt ?? startsAt ?? firstSeenAt`.
- If an `Opportunity` with the same `canonicalUrl` exists: update mutable fields (title,
  dates, requirements, summary, tags, extracted, confidence) unless `reviewedAt` is set, in
  which case only `lastVerifiedAt` changes. Reviewed rows are never overwritten by the machine.
- Else if one with the same `identityKey` exists: create with `duplicateOfId` pointing at it
  and `status = review` (a reviewer decides).
- Else create. Status is `published` when invariant 3 in `docs/03-data-model.md` holds,
  otherwise `review`.
- Slug generation as in the product spec. Collisions get a 4-char suffix.

### Stage 6 · Verify (command `engine verify`)

For published opportunities where `deadlineAt` is within the next 3 days or passed within the
last 14, or `lastVerifiedAt` is older than 7 days: re-fetch `canonicalUrl`. Mark `closed` when
the response is 404 or 410, when the text matches a closed-signal list ("applications are
closed", "registration has ended", "no longer accepting"), or when `deadlineAt`/`endsAt` is
more than 24 hours in the past. Otherwise set `lastVerifiedAt`. Never reopen automatically.

### Stage 7 · Health

After each run, per source:

- `consecutiveErrors`: reset on ok, else increment.
- `consecutiveEmpty`: reset when `nNew > 0`, else increment.
- `baselineWeeklyYield = 0.8 * previous + 0.2 * (nNew scaled to a week)` once 4 runs exist.
- **State** (computed, shown on `/status`): `healthy` if ok and (yielded in 30 days or baseline
  under 0.5/week); `stale` if `consecutiveEmpty >= 8` (two days at 6-hour cadence) and
  baseline over 1/week; `erroring` if `consecutiveErrors >= 3`; `new` if fewer than 4 runs.
- Alerts: the run's summary lists every `stale` and `erroring` source. In Actions, the job
  fails (exit 1) when a source turns `erroring`, so the maintainer gets an email.

## 2. CLI

```
pnpm engine run [--source <key>] [--org <slug>] [--dry-run] [--llm] [--limit N]
pnpm engine verify [--all]
pnpm engine health
pnpm engine snapshot --out <dir>
pnpm engine record --source <key>          # record fixture from the live network
pnpm engine replay --source <key>          # run fetch+extract against the fixture, print diff
pnpm engine registry:check                 # validate all YAML, report feeds found on watch pages
pnpm engine eval                           # score the rules extractor on the labelled eval set
```

`--dry-run` prints drafts and skips the loader. All commands log JSON lines to stdout and a
human summary to stderr.

## 3. Record and replay fixtures

Copied from CLIST's design.

- `pnpm engine record --source hng/site` runs the fetcher with an `HttpClient` whose
  `onExchange` hook captures every response (robots.txt included) and writes
  `packages/engine/test/fixtures/hng__site/http.json.gz` (`GET <url>` → status, headers,
  body, in order) and `expected.json` (the validated `RawItemInput[]`; the rules extractor's
  `OpportunityDraft[]` joins it in M1.7). Sources are read from the registry YAML, so no
  database is needed.
- Recording drops `Set-Cookie`, `Cookie` and `Authorization` headers, masks any other header
  value matching a credential pattern (`CREDENTIAL_PATTERNS` in `src/fixtures/record.ts`:
  bearer tokens, `api_key=`-style pairs, AWS, GitHub and Anthropic keys, JWTs), and refuses
  to write anything if a body matches, throwing `FixtureContainsCredential` with the URL and
  offset.
- Tests construct `http` from a `ReplayDispatcher` over the fixture. A request with no
  recorded key throws `UnexpectedNetworkAccess` (never retried, never mistaken for an
  unreachable robots.txt). The engine's vitest `setupFiles` installs `NoNetworkDispatcher`
  as undici's global dispatcher, so even a stray `fetch()` fails; nothing can reach the
  network. A source with no fixture throws `FixtureMissing`.
- `pnpm engine replay --source <key>` prints a unified diff of actual vs expected and exits 1
  on difference. `--update` rewrites `expected.json` after a human looks at the diff.
- Fixture size: keep bodies under 300 KB each; truncate HTML after the relevant container in
  the adapter's `fetch` before recording where possible.
- Every `Source` with kind `feed`, `sitemap`, `html` or `api` must have a fixture; a test
  enumerates the registry and fails for any missing one, and for any adapter in
  `adapters/index.ts` without one. Sources whose adapter is not written yet are named in
  that test, so the list only shrinks on purpose.

## 4. Scheduling (GitHub Actions)

`engine.yml`:

```yaml
on:
  schedule: [{ cron: "17 */6 * * *" }]
  workflow_dispatch: { inputs: { source: { type: string, required: false } } }
concurrency: { group: engine, cancel-in-progress: false }
jobs:
  run:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - checkout; setup-node 22 with pnpm cache; corepack enable; pnpm install --frozen-lockfile
      - run: pnpm --filter @devspot/db generate
      - run: pnpm engine run ${{ inputs.source && format('--source {0}', inputs.source) }}
        env: { DATABASE_URL: ${{ secrets.ENGINE_DATABASE_URL }}, EXTRACTION_LLM: ${{ vars.EXTRACTION_LLM }}, ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }} }
      - run: pnpm engine verify
      - run: curl -fsS -X POST "$SITE/api/revalidate" -H "x-revalidate-secret: $SECRET"
      - upload-artifact: engine-log (the JSON lines)
```

The job exits non-zero when any source becomes `erroring`, which emails the maintainer.

## 5. Registry sync

`registry/organizations/<slug>.yaml`:

```yaml
slug: hng
name: HNG Tech
category: trainingProvider
homepageUrl: https://hng.tech
country: NG
city: lagos            # optional
description: >
  Africa's largest remote internship programme, running cohorts several times a year.
sources:
  - name: site
    kind: html
    url: https://hng.tech/internship
    adapter: hng
    cadence: quarterly
  - name: blog
    kind: feed
    url: https://blog.hng.tech/feed
    cadence: rolling
```

`pnpm db:sync-registry` validates every file with `validateRegistry` (the same check as
`pnpm registry:check`: `OrganizationYaml`, slug matches file name, no duplicates) and writes
nothing if any file fails, throwing `RegistryValidationError` with one `file: field: message`
line per problem. It then computes the file hash,
upserts `Organization` and `Source` by slug and key, disables sources removed from the file,
and never deletes rows (history stays). It runs at the start of `engine run` and in CI as a
check.

## 6. Observability

- Every run writes a `FetchRun` per source and a JSON summary line:
  `{ run: id, sources: n, ok: n, errors: n, new: n, changed: n, published: n, review: n, stale: [...], erroring: [...] }`.
- `/status` renders from `Source` and the latest `FetchRun`s.
- No external logging service in v1. Actions logs are retained 90 days.

## Acceptance

- [ ] `pnpm --filter @devspot/engine test` passes with the network disabled and covers every registry source with a fixture.
- [ ] `pnpm engine run --dry-run --source <any feed source>` prints drafts from the live network locally.
- [ ] Deleting a fixture makes the enumeration test fail with the source key in the message.
- [ ] A source whose URL returns 500 three runs in a row shows `erroring` on `/status` and fails the Actions job.
- [ ] Grep of `packages/engine/src/fetchers` and `src/adapters` for `@devspot/db` finds nothing.
