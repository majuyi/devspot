# 0020 · The M5 registry gate counts what readers see

**Context.** The M5 gate asks for "60+ organizations". M5.4 was taken ahead of M4 on
2026-11-26 to weight the registry towards Nigeria, because 61 of 86 published items were
Devpost hackathons and only 15 were in Nigeria. After two batches (2026-11-27) the registry
has 47 organisations, 44 of which produce (AltSchool, Ingressive for Good and Paystack are
`manual`). The search for the other 16 found:

- **Job boards.** Of about 150 board names tried for Nigerian companies on Workable, BambooHR, Greenhouse,
  Lever and Ashby, only Moniepoint, Jumia and Helium Health list Nigerian roles on a board
  the engine can read, and only Moniepoint has a tech role today. Most Nigerian employers
  run their own careers pages or post on LinkedIn.
- **Feeds.** NITDA, the Tony Elumelu Foundation and ALX publish press releases and stories,
  with no call to apply in two months.
- **Programme pages.** 3MTT's page still invites applications to its first phase; Women
  Techsters' pages show testimonials; Data Science Nigeria's give no dates; She Code Africa,
  Decagon and LSETF need a browser. Only Google for Startups Accelerator: Africa states
  its dates, and it needs ADR 0019 to reopen when its next round is posted.
- **Luma.** Public calendars have an iCal feed (a supported interface). A few Nigerian tech
  communities run calendars there.

Each further organisation is worth fewer listings than the last, and a count rewards adding
sources that never publish anything. The gate's purpose is in `00`: a reader in Nigeria
does not miss a deadline they could meet.

**Options.**

- **A. Keep 60 organisations.** Reachable only with sources that produce little (GDG on
  Campus chapters, whose events are mostly for one university's students, or programme
  pages without dates).
- **B. Count what readers see.** Replace "60+ organizations" with: in one 30-day window, at
  least 40 open items located in Nigeria or from a Nigerian organisation were published,
  from at least 15 organisations, and every enabled source that is not `manual` produced an
  item in the last 90 days or is marked seasonal in its notes. The weekly benchmark (M5.5)
  reports the figure.
- **C. Both.** 60 organisations and B. The hardest, and the 60 adds nothing B does not
  measure.

**Recommendation.** B. The numbers are a proposal: on 2026-11-27 15 published items are in
Nigeria; the two batches add about 7 (Moniepoint's role and six December DevFests). 40 a
month asks for the feed to more than double its Nigerian share, mostly from employers and
programmes rather than more chapters.

**Decision.** Pending: the maintainer, including the two numbers.

**Consequences, if B is accepted.** `08` M5's gate and M5.4's title change ("Registry for
Nigerian coverage"); the source count stops being a target. Effort goes where items come
from: careers pages without a public board (one adapter each), the Luma calendars, and
ADR 0019 for programmes.

**Status.** Proposed

**Date.** 2026-11-27
