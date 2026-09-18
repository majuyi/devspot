# 0014 · Weekly snapshot as a GitHub Release asset

**Context.** Committing extracted data to the repo gives diff visibility but adds daily noise and the Actions inactivity timer complicates it.

**Decision.** The database is the system of record. A weekly snapshot of the public DTOs is published as a GitHub Release asset with checksums. The keepalive handles the inactivity timer separately.

**Consequences.** Consumers get a stable, versioned dataset. Git history stays about code.

**Status.** Accepted, 2026-09-18.
