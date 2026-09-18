# 0009 · The web app leads; digest and WhatsApp are designed for, shipped later

**Context.** The Notion plan was digest-first with six weeks of hand-sent email before any code. Dami's product picture is a fast public web app with canonical pages, a location-aware feed and an API.

**Decision.** v1 is the web app plus API. The schema and pipeline leave room for a digest and a submissions inbox; both ship after M5 by ADR.

**Consequences.** Canonical URLs exist from M2, which is what makes forwarding work. Email and WhatsApp become channels on top of the same data.

**Status.** Accepted, 2026-09-18.
