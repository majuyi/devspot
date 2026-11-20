# 0017 · LLM extraction deferred; M3 runs on rules

**Context.** `05` §2 adds a Claude extractor at M3 behind `EXTRACTION_LLM=1`, capped by a
monthly token budget. The project has no money for API calls at the moment, and `09` §6
otherwise costs nothing to run. On the 100-item eval set (M3.1) the rules extractor alone
already meets the kind bar (60 of 65 opportunities, 92%) and gets 21 of 27 stated deadlines
exactly (78%) against a 90% bar. `00` also names zero LLM dependencies as part of why
deterministic data is trusted.

**Decision.**

1. No LLM extractor is built for now. `05` §2 stays as the design for when there is a
   budget; it is marked deferred, not deleted.
2. The M3 gate is unchanged and is measured on the rules extractor: improve the rules
   until deadline exact match reaches 90% where a deadline is stated, never by guessing a
   date.
3. M3 is re-cut: M3.2 becomes "Rules to the gate", M3.3 keeps the weighted confidence and
   threshold for rules drafts and drops the rules-versus-LLM comparison, M3.5's live week
   runs on rules. The LLM extractor moves to Later.
4. The `Extraction` and `UsageMeter` tables and the `EXTRACTION_*` variables stay; they are
   empty and unused until this is revisited.

**Consequences.** Items whose dates the rules cannot read stay `unknown` or go to review,
so the review queue carries more of the load during the live week. Bringing the LLM back
needs only a budget and the work in `05` §2; this ADR is then superseded.

**Status.** Accepted

**Date.** 2026-11-20
