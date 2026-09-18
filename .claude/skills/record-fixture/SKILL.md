---
name: record-fixture
description: Record or refresh an offline HTTP fixture for a source. Use when a new source or adapter is added, when a site legitimately changed and the golden output must be updated, or when the fixture enumeration test names a missing fixture.
---

# Record a fixture

Design: `docs/04-engine-spec.md` §3.

1. Ask before recording: it uses the live network. State the source key.
2. `pnpm engine record --source <key>`. It writes
   `packages/engine/test/fixtures/<key with / as __>/http.json.gz` and `expected.json`.
3. Read the scrub report. If it refused because a credential pattern matched, find the
   header or body field and add it to the scrub list in `src/fixtures/record.ts`; never
   commit a fixture with a token in it.
4. Check the fixture size. Bodies over 300 KB: narrow the adapter's request or truncate
   after the relevant container.
5. Open `expected.json` and sanity-check three items by hand.
6. `pnpm engine replay --source <key>` must print no diff and exit 0.
7. When refreshing: keep the old `expected.json` diff in the PR description so the reviewer
   sees what the site changed.
