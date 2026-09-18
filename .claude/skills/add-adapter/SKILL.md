---
name: add-adapter
description: Write or fix an HTML or API adapter in packages/engine/src/adapters. Use when a registry source has kind html or api, when an adapter's fixture replay fails, or when /status shows a source erroring because markup changed.
---

# Add or fix an adapter

Contract: `docs/04-engine-spec.md` §1 "Adapter contract". Return every listed item with
`url`, `title`, `text` and, when present, `publishedAt` and `meta`. Do not filter by date, do
not extract structure, do not import `@devspot/db`, do not call any LLM.

1. Read the source page by hand (`curl -sL <url> | head -c 20000` or the browser) and find
   the container that lists items and the per-item link. Prefer stable hooks: `<article>`,
   `[data-*]`, semantic headings. Avoid utility class names.
2. Create `packages/engine/src/adapters/<slug>.ts` exporting a default `Adapter` with
   `key: "<slug>"`. Use `cheerio`. Resolve relative URLs against `source.url`. Produce
   `text` from the item's own detail page when the list only has titles (one extra request per
   new item is fine; the HTTP client rate-limits).
3. Record the fixture: `pnpm engine record --source <org>/<name>`. Confirm with the user
   before hitting the network. Inspect `expected.json`: are the items real opportunities,
   are titles clean, is text readable?
4. Add a test in `packages/engine/test/adapters/<slug>.test.ts` that replays the fixture and
   asserts item count and one known title.
5. Run `pnpm --filter @devspot/engine test`. The enumeration test must pass.
6. When fixing an existing adapter: run `pnpm engine replay --source <key>` first, read the
   diff, change the selector, re-record, and explain in the PR what changed on the site.
