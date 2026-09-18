# 0007 · One repo, hard internal boundary

**Context.** Should the engine be hosted separately from the product?

**Decision.** One monorepo. The engine is a cron job, not a service. The boundary is the database schema plus the published API and snapshot; dependencies point one way and the engine never imports the app.

**Consequences.** Monorepo velocity now; splitting later is cheap because the seam exists. Other consumers use the API or snapshot.

**Status.** Accepted, 2026-09-06; restated with the database as the seam 2026-09-18 (supersedes the JSON-artifact-only framing).
