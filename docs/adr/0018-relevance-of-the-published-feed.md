# 0018 · Relevance of the published feed

**Context.** After the M3.5 rule fixes (2026-11-21), 93 items are published. Read-only counts
from production:

| Source | Published | Of which |
|---|---|---|
| Devpost | 79 (85%) | All online. 1 mentions Nigeria or Africa. |
| Zindi | 9 | All online. 4 mention Nigeria or Africa. |
| GDG chapters (DevFests) | 5 | All in Nigerian cities. |
| Everything else (employers, fellowships, programmes) | 0 | |

What the 79 Devpost listings say about who can enter (their own "Who can participate" lines):

| Entry stated | Count | Open to a Nigerian university student? |
|---|---|---|
| "Students only" or "College students only" | about 37 | Yes. Devpost's "students" is worldwide. |
| "Ages 13+ only" | about 16 | Yes, adults included. |
| No restriction (sponsored: Kiroween, Codegeist, AWS, QNX, Reddit) | about 11 | Yes. These are the largest prizes. |
| An upper age limit ("Ages 13 to 18 only", "13 to 21") | about 8 | Mostly no: for school pupils. |
| One named institution ("UIUC students only") | 1 or more | No. |
| Ages 18+ | 2 | Yes. |

About half have no cash prize. So the feed is not mostly closed to the audience: most of it is
technically open. The problem is mix. A reader in Lagos sees 79 global online hackathons and 5
local events, and **no jobs, internships, fellowships or programmes at all**, though `00` §2
names them first.

The jobs are missing by construction, not by chance. Invariant 3 lets a rules-only item
publish only with a stated date, and employer careers pages almost never state a closing date.
Under ADR 0017 (no LLM), every job from Renmoney, Chowdeck, Flutterwave, FairMoney, Kuda
and Paga waits in review for ever: 16 today, all Nigerian, all in the audience's fields.

Two golden rules bound the options. Never assert eligibility: no option may tell a reader they
qualify, or decide for them that they do not. Never guess a date: a job with no stated
deadline is shown as "deadline not stated", never given one.

**Options.**

A. **Do nothing; rely on filters.** No cost. The home page stays about 85% global hackathons,
   and jobs never appear without a maintainer publishing each one.

B. **Hold listings closed to the audience by their own words** for review: an upper age limit
   below 22, or one named institution ("UIUC students only", "UNC-CH students only"). This is
   the same mechanism as the invite-only and members-only holds: it routes and discards
   nothing, and a reviewer can publish. It does not judge eligibility; it reads a restriction
   the page states. It would take about 9 listings out of the feed.

C. **Narrow Devpost at the source** (the registry's item filter), for example cash prizes
   only. Not recommended: prize size is our taste, not the reader's, and it would drop real
   student hackathons that Nigerian students can enter.

D. **Order by place.** `00` §2 and ADR 0011 already say Lagos events and Lagos roles come
   first, remote alongside. Make the home feed band items in Nigeria (and items whose text
   names Nigeria or Africa) before "Online, worldwide". Global hackathons stay, below local
   ones. A presentation change in `01`, no data change.

E. **Let employer jobs publish without a stated deadline.** Change invariant 3 so a rules-only
   item of kind `job` or `internship` from an `employer` organisation's careers source can
   publish with `deadlineKind: unknown`, shown as "deadline not stated", when kind and
   location are confident (the existing 0.7 threshold, without the stated-date requirement).
   The promise is about deadlines a reader could miss; a role with no stated deadline cannot
   be shown with a wrong one. It would publish about 16 Nigerian roles today. Taking a filled
   role down is the risk: verify (stage 6) closes a role whose page returns 404 or 410 or says
   applications are closed, but many careers sites redirect a removed role to their list
   page, which verify does not catch yet. E needs that check too: close a job that is no
   longer in its source's listing.

F. **Change the source mix.** Bring the M5.4 "Registry to 60" work forward and weight it to
   Nigerian and African organisations (employers with internships, fellowships, accelerators,
   bootcamps), so the global share falls as local sources grow. This is the lasting fix and
   the slowest.

**Recommendation.** B and D now: both are small, reversible and within current rules. E as
the decision this ADR asks for: it changes invariant 3 and is what puts jobs on the site.
F as the priority for M5.4. Not C.

**Decision.** Not yet made. For the maintainer.

**Consequences, if B, D and E are accepted.** The published mix moves from 79 global hackathons
and 5 local events to about 70 global hackathons, 5 local events and about 16 Nigerian roles,
with local items first on the home page. B and E need rule and loader tests and an eval check
(no false publishes), and E a check that closes a role gone from its source's listing. D changes `01` §2 and the home page. E changes `03` §4 invariant 3 and
`05` §2. The 0.7 threshold, the holds and the M3 gate are unchanged.

**Status.** Proposed

**Date.** 2026-11-21
