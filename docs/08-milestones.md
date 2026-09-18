# 08 · Milestones

> **What Opus needs to know.** Work is organized as milestones M0 to M5, each a list of
> tasks sized for one focused session. Do tasks in order inside a milestone; do not start the
> next milestone until the current gate passes. Each task names its spec section, its files,
> and its acceptance check. "Done" means the acceptance check passes in CI, the docs were
> updated if behaviour changed, and the task is ticked here in the same PR. A task that turns
> out to need a decision not covered by `docs/` stops and gets an ADR first.

Registry research is a parallel, non-code track owned by Dami: interview 15 to 20 people who
got something good in the last year ("where did you first hear about it?"), enumerate the
organizations, and add YAML files as they are confirmed. Target 20 organizations by the end
of M1 and 60 by M5.

## M0 · Foundation

Gate: `pnpm check` is green from a clean clone against an empty database; adding an organization
YAML with a mistake fails validation with a clear message; the schema package emits JSON
Schema; the Prisma schema migrates.

- [ ] **M0.1 Workspace scaffold.** Root `package.json` (`packageManager: pnpm@10`, scripts
  `ci`, `dev`, `lint`, `typecheck`, `test`, `build`, `engine`, `db:*`), `pnpm-workspace.yaml`,
  `turbo.json` (tasks `build`, `lint`, `typecheck`, `test` with `dependsOn: ["^build"]`),
  `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `moduleResolution: bundler`,
  `verbatimModuleSyntax`), `biome.json`, `.gitignore`, `.editorconfig`, `.nvmrc` (22).
  Spec: `02` §2–3. Check: `pnpm install` and `pnpm lint` run with no packages yet.
- [ ] **M0.2 `@devspot/schema`.** Enums, `CITIES`, `TAGS`, `OrganizationYaml`,
  `RawItemSchema`, `OpportunityDraftSchema`, `OpportunitySchema`, `PreferencesSchema`,
  `ApiListParams`, `SnapshotSchema`; `scripts/emit-json-schema.ts` writing to `docs/schema/`.
  Spec: `03` §3. Check: `pnpm --filter @devspot/schema test` covers each schema with a valid
  and an invalid case; three JSON Schema files exist after `build`.
- [ ] **M0.3 `@devspot/db`.** Prisma 7 schema from `03` §2, `prisma.config.ts`, client with
  `@prisma/adapter-pg`, first migration, `enum-parity.test.ts`, `docker-compose.yml` with a
  Postgres 17 service for local dev. Check: `prisma validate`; `migrate deploy` on the Docker
  database; parity test passes.
- [ ] **M0.4 Registry format and sync.** `registry/organizations/` with 10 seed files
  (suggested: hng, outreachy, gsoc, mlh, devpost, paystack, flutterwave, ingressive-for-good,
  altschool, gdg-lagos; verify each URL by hand and mark `kind: manual` where no feed or
  stable page exists yet), `scripts/sync-registry.ts` in `db`, `pnpm registry:check`. Spec:
  `04` §5. Check: sync creates 10 organizations and their sources; a second run is a no-op;
  a malformed file fails with the path and field.
- [ ] **M0.5 CI.** `.github/workflows/ci.yml` with a Postgres service, running
  `pnpm check` (lint, typecheck, test, build, `prisma validate`). Spec: `02` §5, `09` §5.
  Check: green on the PR.
- [ ] **M0.6 Repo hygiene.** `README.md` (what, quick start, links into docs), `LICENSE`
  (Apache-2.0), `CONTRIBUTING.md` (already written; verify commands match),
  `SECURITY.md` (report by email), `CHANGELOG.md` (Keep a Changelog, `Unreleased`).
  Check: links resolve; `pnpm` commands in README run.

## M1 · Engine core

Gate: 20 organizations yield real opportunities through the pipeline into the database;
`pnpm --filter @devspot/engine test` passes with the network disabled and every source has
a fixture; a deliberately broken source shows `erroring` on the health report and fails
the Actions job.

- [ ] **M1.1 HTTP client and robots.** `src/http.ts` over undici with per-host rate limit,
  timeout, retries, user agent, `robots.txt` cache; `RobotsDisallowed` error. Spec: `04` §1.
  Check: unit tests with a `MockAgent` for retry, rate limit timing, robots deny.
- [ ] **M1.2 Record and replay.** `src/fixtures/{record,replay}.ts`, credential scrubbing,
  `UnexpectedNetworkAccess`, vitest setup that installs the replay dispatcher globally,
  `engine record` and `engine replay` commands. Spec: `04` §3. Check: recording a source
  writes `http.json.gz` and `expected.json`; replay with a missing key throws; a body
  containing `Bearer abc` is refused.
- [ ] **M1.3 Feed fetcher.** feedsmith-based, conditional headers, HTML stripping to text.
  Spec: `04` §1. Check: fixtures for three real feeds (record them), golden output tests.
- [ ] **M1.4 Sitemap fetcher.** Sitemap and index parsing, `include` glob, readable-text
  extraction. Check: fixture for one real sitemap source.
- [ ] **M1.5 Adapter loader and two adapters.** `src/adapter.ts` contract, `fetchers/html.ts`,
  adapters for `hng` and one more org without a feed, with fixtures. Check: enumeration test
  fails if an adapter has no fixture.
- [ ] **M1.6 Dedupe.** URL canonicalization, content hash, `RawItem` upsert semantics. Spec:
  `04` §1 stage 2. Check: table tests for canonicalization; upsert behaviour tests against
  the Docker database.
- [ ] **M1.7 Rules extractor.** `extract/rules.ts` per `05` §1 with table-driven tests (10+
  cases per field, negatives included). Check: eval harness skeleton `engine eval` runs on
  20 hand-labelled items with reported accuracy.
- [ ] **M1.8 Validate and load.** `identityKey`, slug generation, publish rule at M1
  threshold, reviewed-row protection, duplicate handling. Spec: `04` §1 stage 5, `03` §4.
  Check: invariant tests 3, 4, 6 pass.
- [ ] **M1.9 Verify and health.** `engine verify`, health counters and state computation,
  run summary JSON. Spec: `04` §1 stages 6–7. Check: state transitions tested; a 500 source
  reaches `erroring` after 3 runs.
- [ ] **M1.10 CLI and run orchestration.** `engine run` with flags, per-source isolation
  (one failing source never stops the run), JSON lines logging. Check: `--dry-run` against
  a fixture prints drafts; exit code 1 when a source turns `erroring`.
- [ ] **M1.11 Actions.** `engine.yml`, `keepalive.yml`, `backup.yml`, `migrate.yml`; the
  `engine` database role in Supabase; secrets set. Spec: `09`. Check: manual dispatch of each
  succeeds; `/status` (M2) will read the results, so for now confirm `FetchRun` rows appear.
- [ ] **M1.12 Registry to 20.** Add and verify 10 more organizations with fixtures. Check:
  gate condition on yield.

## M2 · Web app v1

Gate: every public route exists and meets the performance budget; every published
opportunity has a canonical URL that unfurls on WhatsApp; filters are URL-encodable;
`/admin` works end to end; the app is deployed on Vercel and the engine's revalidate call
refreshes it.

- [ ] **M2.1 App scaffold.** `apps/web` with Next.js 16, Tailwind 4, tokens from `07` §3,
  fonts self-hosted, root layout with header and footer, `/dev/tokens`. Check: Lighthouse on
  an empty page 100/100/100.
- [ ] **M2.2 Components.** The inventory in `07` §5 as files, plus `/dev/components`. Check:
  axe clean; each component has a render test.
- [ ] **M2.3 Data access layer.** `apps/web/src/data/*.ts` query functions returning DTOs
  (`06` §2), shared by pages and API. Check: unit tests against the Docker database with
  seeded rows.
- [ ] **M2.4 Home and browse.** `/` and `/opportunities` per `01` §3, filter bar, search,
  cursor pagination. Check: acceptance items in `01`.
- [ ] **M2.5 Opportunity page.** `/o/[slug]`, JSON-LD, `opengraph-image`, `.ics`, related
  items, closed banner, 404 for review items. Check: unfurl test with a WhatsApp preview
  debugger or the Facebook sharing debugger.
- [ ] **M2.6 Organizations.** `/org`, `/org/[slug]`, health dots. Check: registry file link
  resolves.
- [ ] **M2.7 Events list and calendar.** `/events` list view, `/calendar` month grid,
  `/calendar.ics`. Check: `.ics` validates; month navigation keeps the URL in sync.
- [ ] **M2.8 Feed and preferences.** `/feed`, `POST /api/prefs`, query-string precedence,
  share link. Spec: `01` §2. Check: acceptance items.
- [ ] **M2.9 Status page.** `/status` from `Source` and `FetchRun`. Check: matches
  `engine health` output.
- [ ] **M2.10 Admin.** Login, middleware, queue tabs, review form, actions, JSON logging.
  Spec: `01` §4, `02` §7. Check: unauthenticated requests to `/admin/*` and `/api/admin/*`
  are redirected or 401.
- [ ] **M2.11 API v1.** Route handlers per `06` §3, DTO validation tests, rate limiting,
  OpenAPI document and `/api` page. Check: acceptance items in `06`.
- [ ] **M2.12 Deploy.** Vercel project, env vars, `POST /api/revalidate` wired from
  `engine.yml`, `NEXT_PUBLIC_SITE_URL`. Check: an engine run changes the home page within a
  minute.
- [ ] **M2.13 Performance pass.** Bundle analysis, font check, CLS audit on real devices.
  Check: `01` §6 budget met on every route.

## M3 · Extraction and trust

Gate: on the 100-item eval set, deadline exact match 90%+ where stated and kind accuracy
90%+; zero eligibility-word violations; fewer than 1 in 5 published items corrected during one
week of live review.

- [ ] **M3.1 Eval set to 100.** Hand-label from real fixtures; store under
  `packages/engine/test/eval/`. Check: `engine eval` reports on all 100.
- [ ] **M3.2 LLM extractor.** `extract/llm.ts` per `05` §2, structured outputs, evidence
  verification, cache, budget meter, fallbacks. Check: acceptance items in `05`.
- [ ] **M3.3 Confidence and thresholds.** Weighted overall, rules-vs-LLM deadline
  disagreement rule. Check: unit tests.
- [ ] **M3.4 Review queue polish.** Evidence highlighting, ignore list on reject, duplicate
  merge and split. Check: a rejected `not-an-opportunity` URL is not re-queued after a
  content change.
- [ ] **M3.5 Live week.** Turn `EXTRACTION_LLM=1` in Actions, review daily for a week, log
  corrections. Check: gate numbers recorded in the PR that closes M3.

## M4 · Events, map, submissions

Gate: 30+ geocoded events render on the map with correct pins; a submission from `/submit`
reaches the admin queue and can be published; OpenAPI validates; the weekly snapshot release
exists.

- [ ] **M4.1 Geocoding.** `engine geocode`: Nominatim with a 1 request per second limit,
  cache by normalized address in `Opportunity.geoSource`, manual override in admin.
- [ ] **M4.2 Map view.** MapLibre GL, OpenFreeMap style, clustering, viewport list, city
  recenter, mobile sheet. Spec: `01` §3 Events, `07` §7. Check: JS budget for the map route
  under 250 KB gzipped; other routes unchanged.
- [ ] **M4.3 Submit.** `/submit`, `POST /api/submit`, honeypot, rate limit, duplicate
  detection, admin tab. Check: acceptance items.
- [ ] **M4.4 Snapshot.** `engine snapshot`, `snapshot.yml`, release assets, schema
  validation. Check: `06` §5.
- [ ] **M4.5 API docs page.** `/api` with the OpenAPI renderer. Check: renders offline
  from `docs/schema/openapi.json`.

## M5 · Launch

Gate: name and domain live; 60+ organizations; one merged PR from someone Dami did not ask;
the weekly benchmark shows at least five items in a month that YouthOp and Opportunity Desk
did not list.

- [ ] **M5.1 Name.** Decide, buy the domain, rename the package scope and wordmark, update
  `NEXT_PUBLIC_SITE_URL`, redirects from the Vercel URL.
- [ ] **M5.2 SEO.** Sitemap, robots, canonical tags, structured data validation, Search
  Console.
- [ ] **M5.3 Contribution on-ramp.** Good-first-issue labels generated from `/status`,
  issue templates (`add-organization`, `broken-source`, `wrong-data`), PR template.
- [ ] **M5.4 Registry to 60.** With fixtures.
- [ ] **M5.5 Benchmark process.** A weekly checklist and a `docs/benchmarks/YYYY-WW.md`
  entry format; the `/status` coverage section reads from it.
- [ ] **M5.6 Launch post and channels.** Announce in the communities that were interviewed
  in the registry research.

## Later (decide after M5, each needs an ADR)

Weekly digest email (Resend, preferences-driven, `engine digest`), WhatsApp forward-in
number (Business API webhook to `Submission` with `channel: whatsapp`), Telegram channel
bot reading the API, Ghana and Kenya (cities, organizations, `country` filter in the UI),
Supabase Auth for a second reviewer, TypeScript 7, Prisma 8.
