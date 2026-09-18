# 0004 · Fetchers and adapters never write to the database

**Context.** TechNG had Python scrapers writing to Postgres while the schema lived in Prisma: two sources of truth, silent breakage on migration, and a database needed to test a scraper.

**Decision.** Fetch and extract stages return values. One loader writes. Fetchers and adapters cannot import the db package (enforced by lint and tests).

**Consequences.** Scrapers are pure functions, testable offline, contributable without credentials, immune to schema drift.

**Status.** Accepted, 2026-09-06; reaffirmed in TypeScript 2026-09-18.
