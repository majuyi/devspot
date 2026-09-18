# 00 · Vision

> **What Opus needs to know.** This project is a continuously updated, structured index of
> opportunities for early-career tech people in Nigeria, delivered first as a fast public web
> app with a canonical page per opportunity, a location-aware feed, and a read-only API. It is
> open source, not a business. Every design decision is tested against one promise: **a reader
> will not miss a deadline they were eligible for.** Everything else in `docs/` is downstream
> of this file.

## 1. The premise

Opportunities for Nigerian tech early-career people (internships, graduate roles, fellowships,
scholarships, grants, hackathons, open-source programmes, accelerators, bootcamps, meetups and
conferences) are announced by a **finite, enumerable set of organizations** and then scattered
across WhatsApp groups, X, LinkedIn, newsletters and aggregator boards. The scattering is the
problem. The organizations are the solution: each one publishes on a page that is stable,
low-traffic and legal to poll.

The engine keeps a public registry of those organizations, polls their pages, extracts
structured opportunities, and publishes them with a canonical URL. The product on top of the
engine is a web app that answers three questions instantly: *what is open right now, what
closes soon, and what is near me.*

## 2. The audience

**Launch:** early-career tech people in Nigeria. Students, recent graduates, career switchers
and juniors with roughly 0 to 2 years of experience across software, data, design and product.

**Location is a first-class dimension**, not a tag. Someone in Lagos should see Lagos events and
Lagos-based roles first, with remote and nationwide opportunities alongside. The data model
carries `city` and `country` as filterable fields from day one.

**Designed in, not built yet:** Ghana, Kenya and South Africa share most global sources with
Nigeria and are the first expansion. Other professions (law, medicine) are not on the roadmap:
their sources do not overlap, so serving them is linear cost with no shared benefit.

## 3. The promise, and why it is falsifiable

> You will not miss a deadline you were eligible for.

Every week the project can ask readers: *did anything reach you through another channel that we
did not have first?* Each "yes" is a bug with a specific cause: a missing organization, a broken
fetcher, a taxonomy gap, a wrong deadline. This makes the product measurable in a way that
"we aggregate opportunities" never is. The weekly benchmark against YouthOp and Opportunity Desk
(what did they have that we missed, what did we have that they did not) is the standing
coverage test.

## 4. What this is not

- **Not an eligibility oracle.** The product shows an organization's requirements verbatim and
  never tells a reader they qualify. "Open to Africans" conceals nationality, residency,
  institution and work-authorisation distinctions. A wrong call costs someone a real
  application, and that is the one mistake that ends credibility permanently.
- **Not a search engine.** Google is excellent at "find me X" and structurally incapable of
  "tell me the moment X appears". The wedge is freshness and completeness, surfaced through a
  location-aware feed. Full-text search exists as a utility, not as the product.
- **Not a general youth-opportunity board.** That space is served by YouthOp, Opportunity Desk
  and Scholarship Region. The gap is depth in one vertical (their taxonomy has four levels under
  Scholarships and none under Jobs, Internships or Hackathons), not breadth across many.
- **Not a business.** No ads, no paid listings, no accounts to monetise. The sustainability
  question is continuity, not revenue: who keeps the pipeline running in a bad month.

## 5. What "built by Google or Apple" means here

It is a quality bar, stated so it can be checked:

- Every public page renders server-side, scores 95+ on Lighthouse mobile, and has no layout
  shift.
- Every opportunity has one canonical URL that unfurls correctly when shared on WhatsApp, X and
  LinkedIn.
- The interface is mobile-first at 360px, works with no JavaScript for reading, and uses one
  consistent design system (`docs/07-design-system.md`).
- The data is trustworthy: deadlines are never guessed, requirements are never paraphrased,
  closed opportunities are marked closed.
- Adding an organization is a one-file pull request that a stranger can make in under an hour
  from `CONTRIBUTING.md` alone.

## 6. Lessons carried from CLIST

The plan is calibrated against [CLIST](https://github.com/aropan/clist), an open-source
competitive-programming aggregator run for seven years by essentially one person. The numbers
that shaped this project (measured at commit `a7a09115`, 2026-09-04):

| Measure | Value | Consequence here |
|---|---|---|
| Sources maintained | 85 Django parsers + ~100 legacy PHP | A large source count is achievable solo, over years |
| Commits touching parsers | 25% of all time; 59% of the last two years | Source maintenance is the dominant cost and grows |
| Single-author share | 93.3% | Open-sourcing distributes benefit, not load |
| LLM dependencies | 0 | Deterministic parsing is why its data is trusted |

What we copy: a registry table as the unit of ingestion, one module per source with no generic
parser, offline record-and-replay fixtures from day one, and health monitoring that notices
when a source goes quiet. What we refuse: queues before they are needed, a 2,000-line ingestion
function, anti-bot machinery. Our sources want to be found.

## 7. Success signals

- A reader says "I found out about this here first", unprompted.
- A link to a canonical page is forwarded into a WhatsApp group by someone we did not ask.
- An organizer submits an opportunity because being listed is worth something.
- A stranger opens a pull request adding an organization.
- The weekly benchmark shows items YouthOp and Opportunity Desk did not have.

## 8. Naming

"devspot" is a code name. The public name is undecided. Criteria: pronounceable in Nigerian
English, available as a `.com` or `.africa`, not already a job board, works as a WhatsApp
contact name. The rename is a find-and-replace on the package scope plus a domain; do it
before launch (M5), not before.

## Acceptance

- [ ] Every later document cites this file's promise or non-goals when justifying a decision.
- [ ] No feature in `docs/01-product-spec.md` asserts eligibility or guesses a deadline.
