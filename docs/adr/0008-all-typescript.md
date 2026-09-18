# 0008 · All TypeScript

**Context.** The Notion plan settled on Python scrapers with a TypeScript product. Dami asked whether that was a compromise for a weaker executor.

**Decision.** All TypeScript, on engineering grounds: one Zod schema shared by fetcher, loader, API and UI; one record/replay mechanism; one toolchain for contributors; the parsing needs (feeds, sitemaps, cooperative HTML) are fully served in TypeScript; Python's advantages (OCR, anti-bot machinery) are things this project must never need.

**Consequences.** No Python in the repo. A source that would need a headless browser or OCR triggers an ADR, not a language change.

**Status.** Accepted, 2026-09-18. Supersedes the 2026-09-06 polyglot decision.
