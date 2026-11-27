# 0019 · A new round on the same page

**Context.** Some programmes keep one page and post each round on it: Outreachy's project
selection page, HNG's internship page, Google for Startups Accelerator: Africa. The loader
finds a row by `canonicalUrl` (unique, invariant 6) and moves only rows in `review` or
`published` (`isMovable`). Once a round's deadline passes, verify closes the row with
`statusReason = date-passed`, and from then on the loader keeps it closed whatever the page
says.

In production on 2026-11-27, Outreachy's row is closed `date-passed` (deadline 31 August
2026). Its next round (May 2027 internships) usually opens in January. When it does, the
engine will read the new deadline from the same URL and leave the row closed. Readers
would miss Outreachy: the opposite of the one promise in `00`. HNG and any programme page
added under M5.4 would go the same way.

**Options.**

- **A. Reopen on a new round.** When a fetch changes the page of a row closed
  `date-passed`, and the new extraction gives a deadline or start later than the stored
  one and not over, the loader treats the row as movable: status from the publish rule as
  for a new item (published or review), `closedAt` and `statusReason` cleared, and one
  history event (`published` or `edited`, actor engine, note "A new round on the same
  page."). The earlier round's dates stay in that event's changes. Rows a maintainer
  closed or rejected, and rows closed `removed-from-listing` (ADR 0018 E has its own
  reopening), are not touched.
- **B. A new row per round.** Keeps each round's row as it was, but needs `canonicalUrl` to
  stop being unique (invariant 6, a migration, and the dedupe rules) or a made-up URL per
  round. More change, and the public page would move with each round.
- **C. Leave it to review.** A maintainer reopens by hand. Relies on someone noticing,
  which is what the engine is for.

**Recommendation.** A. It is a small loader change with a test per case (reopens on a later
date; stays closed on the same or an earlier date; never reopens a maintainer's close or a
rejection), and it matches what readers see on the page.

**Decision.** Pending: the maintainer.

**Consequences, if A is accepted.** Invariant 7 gains a sentence: a row closed because its
date passed reopens when its own page states a later date that has not passed. Outreachy,
HNG and single-page programmes reopen without anyone acting. A page that re-states an old
round with a typo'd later year would reopen wrongly; the publish rule and its holds still
apply, and the history shows the move.

**Status.** Proposed

**Date.** 2026-11-27
