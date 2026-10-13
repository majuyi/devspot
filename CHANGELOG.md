# Changelog

All notable changes to this project are documented here. Format: Keep a Changelog.

## Unreleased

- Specification set, ADRs, CLAUDE.md, skills and the M0 workspace scaffold.
- ADR 0015 accepted: Apache-2.0. Generated JSON Schema in docs/schema is excluded from Biome so builds leave the tree clean.
- First Prisma migration (`20261009000000_init`), generated offline from the schema.
- M0.1: dependency rule now enforced in full by Biome (fetchers could import `@devspot/db`, web could import the engine); `ci` script added (`pnpm run ci`).
- M0.2: `snapshot.schema.json` now validates both weekly release files (`SnapshotFile`); every schema has a valid and an invalid test; a test fails if `docs/schema/` is stale. Docs use the code's schema names.
- M0.3: `prisma generate` and `validate` no longer need `DIRECT_URL`, so `pnpm check` runs from a clean clone; CI fails on schema changes without a migration (`migrate:check`); missing `DATABASE_URL` throws `MissingDatabaseUrlError`.
- M0.4: 10 seed organisations, each source URL and robots.txt checked by hand on 2026-10-09 (Paystack, Ingressive for Good and AltSchool are `manual`; GSoC moves to its blog feed). `registry:check` and `db:sync-registry` share `validateRegistry`; sync validates everything before writing. CI asserts a second sync is a no-op.
- M0.5: `pnpm check` now runs `prisma validate` (in the `db` build). CI actions bumped to checkout v7, setup-node v7, cache v6 (Node 24 runtime); Node version read from `.nvmrc`.
- M0.6: `registry/LICENSE` (CC0 1.0) for the registry the docs already called CC0. SECURITY.md points to GitHub private vulnerability reporting (now enabled); a `security@` address follows with the domain in M5.1. CONTRIBUTING marks engine and web commands that arrive in M1 and M2.
- M1.1: `@devspot/engine` package with `HttpClient`: per-host rate limit (Crawl-delay honoured), 20s timeout, retries with jitter on 5xx and network errors, robots.txt cache with RFC 9309 status handling, redirects checked hop by hop, typed errors.
- M1.2: fixture record and replay. `pnpm engine record` and `pnpm engine replay [--update]` (sources read from the registry YAML); credential scrubbing that refuses bodies with secrets; `UnexpectedNetworkAccess` and a global no-network dispatcher in engine tests; root `engine` script no longer passes a literal `--`.
- Fix: `pnpm check` (and so CI) now runs Biome. It called `turbo run lint`, which ran nothing because no package has a `lint` script. `.claude/settings.local.json` is git-ignored.
- Registry: AfriLabs (Abuja), blog feed. Verified 2026-10-13.
- Spec: `/admin/new` for hand-entered opportunities (manual sources had no way in before `/submit` in M4) and an All tab in `/admin`, so published items can be found and corrected (the runbook relied on it). M2.10 check updated.
- Registry: CcHUB (Lagos), blog feed. Verified 2026-10-13.
- M1.3: feed fetcher (feedsmith 2.9.6 for RSS, Atom, RDF and JSON Feed) with conditional GET (`validators` in and out of `FetchResult`; 304 means no items); HTML to text that keeps paragraph breaks and lists, links in `meta.links`. `FetchFn` returns `FetchResult` as `04` §1 says. Fixtures and golden output for gsoc, afrilabs and cchub; a golden test replays every fixture and fails when a feed source has none.
- `Source` gets `include`, `etag` and `lastModified` columns (migration `20261013000000_source_columns`). Sync no longer packs `include` into `notes` as JSON, and the engine has somewhere to keep feed validators that sync will not overwrite.
- Registry: Chevening, fellowships sitemap. Verified 2026-10-13.
- M1.4: sitemap fetcher: urlset or one level of index, `include` glob, `knownUrls` from the caller, the 20 newest pages per run, page errors skipped and reported. Readable text via @mozilla/readability on linkedom, then the shared HTML-to-text. Fixture and golden output for chevening/fellowships.
- M1.5: `Adapter` contract (`src/adapter.ts`), `fetchers/html.ts` for `html` and `api` sources (adapters listed in `src/adapters/index.ts`, output checked against `RawItemInput`). Adapters for HNG (the internship page as one item, past cohorts and alumni sections dropped) and Devpost (open and upcoming hackathons from its listing API, 40 a page). Fixtures for both; the golden test fails if an adapter has no fixture and names the four registry adapters not yet written (bamboohr, bevy, mlh, outreachy).
