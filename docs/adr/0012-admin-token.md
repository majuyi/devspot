# 0012 · Admin gated by a single token in v1

**Context.** One reviewer, no user accounts, free tiers.

**Decision.** ADMIN_TOKEN login sets an HMAC-signed HTTP-only cookie; middleware guards /admin and /api/admin. Supabase Auth with an email allowlist when a second reviewer exists.

**Consequences.** No auth dependency in v1. Rotation logs the one user out.

**Status.** Accepted, 2026-09-18.
