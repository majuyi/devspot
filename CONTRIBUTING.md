# Contributing

## Add an organization (no code, under an hour)

This is the most useful thing you can do. One file, one pull request.

1. Find the organization's page that changes when they announce something: a careers page,
   a programme page, a blog. Check whether it has an RSS or Atom feed (view source and look
   for `application/rss+xml`, or try `/feed`, `/rss`, `/blog/feed`). Feeds are better than
   pages: they need no code and never break.
2. Copy `registry/organizations/_template.yaml` to `registry/organizations/<slug>.yaml`
   and fill it in. `slug` is lowercase and hyphenated. `kind` is `feed` when you found a
   feed, `sitemap` when the site has one and new opportunities get their own URLs, `html`
   when neither (an adapter will be needed, see below), or `manual` if the organization only
   announces on social media.
3. Run `pnpm registry:check`. It validates the file and tells you if it found a feed you
   missed.
4. Open a pull request titled `registry: add <name>`. That is all.

## Fix a source that stopped working

`/status` on the site lists stale and erroring sources, worst first. Pick one, run
`pnpm engine run --source <key> --dry-run`, read the error, fix the URL in the YAML or the
adapter, re-record the fixture with `pnpm engine record --source <key>`, look at the diff
that `pnpm engine replay --source <key>` prints, and open a PR.

## Write an adapter (some code)

For `html` and `api` sources. One file at `packages/engine/src/adapters/<slug>.ts`
implementing the `Adapter` contract in `docs/04-engine-spec.md`. Return every listed item
with `url`, `title`, `text` and, if known, `publishedAt`. Do not filter by date, do not
extract structure, do not touch the database. Record a fixture; the test suite refuses an
adapter without one.

## Report wrong data

Open an issue with the opportunity URL and what is wrong. Wrong deadlines are the most
important bug we have.

## Setting up

```sh
corepack enable
pnpm install
docker compose up -d db
cp .env.example .env            # fill DATABASE_URL and DIRECT_URL for the local database
pnpm db:migrate
pnpm db:sync-registry
pnpm test                        # runs with the network disabled
pnpm dev                         # web app on http://localhost:3000
```

## Rules

- Small PRs. One organization, one adapter, one fix.
- Never assert eligibility anywhere in code or copy. Requirements are shown verbatim.
- Never guess a date. If the source does not state a deadline, it is `unknown`.
- Respect `robots.txt` and one request per second per host. Our sources want to be found;
  we do not need to be clever.
- Read `CLAUDE.md` if you are using an AI coding agent; the same rules apply to it.

Licence: Apache-2.0 for code; the registry is CC0.
