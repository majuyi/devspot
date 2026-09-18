---
name: add-organization
description: Add or update an organization in registry/organizations. Use when asked to add, track, or fix an organization or source; when a URL for a careers or programme page is given; or when /status shows a source needs a new URL.
---

# Add an organization

1. Confirm the organization publishes opportunities itself (not a media outlet or an
   aggregator). If it does not, stop and say why.
2. Find the page that changes on announcement. Check for a feed first: view source for
   `application/rss+xml` or `application/atom+xml`; try `/feed`, `/rss`, `/blog/feed`,
   `/atom.xml`. Then check `/sitemap.xml`. Prefer `feed` > `sitemap` > `html` > `manual`.
3. Copy `registry/organizations/_template.yaml` to `<slug>.yaml`. Fill every required field
   from `docs/04-engine-spec.md` §5. `country` is ISO alpha-2. `city` only from the list in
   `packages/schema/src/cities.ts`.
4. Run `pnpm registry:check`. Fix what it reports.
5. If `kind: html` or `api`, the source needs an adapter: use the `add-adapter` skill.
6. If the database is available locally, run `pnpm db:sync-registry` and
   `pnpm engine run --source <slug>/<name> --dry-run`, and include the first three drafts in
   your summary.
7. Open a PR titled `registry: add <name>` (or `registry: update <name>`). One organization
   per PR.
