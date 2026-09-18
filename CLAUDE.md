# CLAUDE.md

Operating contract for AI coding agents in this repository. Read it fully before acting.

## What this is

An open-source engine and web app that indexes opportunities (internships, jobs, fellowships,
scholarships, grants, hackathons, open-source programmes, events, competitions, accelerators,
bootcamps) for early-career tech people in Nigeria. One promise: **a reader will not miss a
deadline they were eligible for.** Code name `devspot`; the public name is undecided.

## Read order (do this at the start of every task)

1. `docs/08-milestones.md` to find the task you are doing and its acceptance check.
2. The spec sections that task cites. Specs are numbered `docs/00` to `docs/09`.
3. `docs/adr/README.md` to know which decisions are closed.
4. The files the task names. Inspect before editing.

If the task needs a decision the specs do not cover, stop, write `docs/adr/NNNN-*.md` with
status Proposed, say so in your summary, and do not guess.

## Golden rules

- **Never assert eligibility.** No code path, copy, prompt or summary says a reader qualifies.
  `requirementsText` is stored and rendered verbatim.
- **Never guess a date.** A deadline exists only when the source states it. `unknown` is a
  valid and common value.
- **Fetchers and adapters never import `@devspot/db`.** They return values. One loader writes.
- **Every source has a recorded fixture.** Tests run with the network disabled. A cache miss
  is a test failure, not a fallback.
- **Dependencies point one way:** `web → db → schema`, `engine → db → schema`. Never
  `engine ↔ web`.
- **Do not add** a queue, user accounts, a second API layer, a search index, a headless
  browser, Python, or a new major version of a pinned dependency without an ADR.
- **Small, reviewable changes.** One task per PR. Match surrounding code. No drive-by
  refactors.
- **No destructive or outward-facing commands** without explicit approval: no `git push`, no
  `git reset --hard`, no `prisma db push` against anything but local Docker, no `DROP`, no
  secrets in logs or commits.
- **Be honest about verification.** Say what ran and what did not.

## Commands

```sh
corepack enable && pnpm install     # once
docker compose up -d db             # local Postgres
pnpm db:migrate                     # apply migrations locally (uses DIRECT_URL)
pnpm db:sync-registry               # load registry YAML into the local database
pnpm lint · pnpm typecheck · pnpm test · pnpm build
pnpm check                             # all of the above, what CI runs
pnpm engine run --source <key> --dry-run
pnpm engine record --source <key>   # record a fixture (needs network, asks first)
pnpm engine replay --source <key>   # diff against the fixture
pnpm registry:check                 # validate registry YAML
pnpm dev                            # web app
```

Narrowest check first, then broaden: the package's tests, then `pnpm check`.

## Definition of done for a milestone task

- The acceptance check named in `docs/08-milestones.md` passes locally and in CI.
- Tests exist for new behaviour; invariants in `docs/03-data-model.md` §4 stay covered.
- Docs updated if behaviour or commands changed. The task is ticked in `docs/08-milestones.md`
  in the same PR. `CHANGELOG.md` has a line under Unreleased.
- Your final message lists: what changed and where, checks run and results, anything not
  verified, and the next task.

## Skills

`.claude/skills/` holds step-by-step procedures. Use them by name when the task matches:
`add-organization`, `add-adapter`, `record-fixture`, `run-and-verify`, `ship-task`.

## Style

TypeScript strict. Named exports. Zod at every boundary. No default exports except adapters
and Next.js pages. Errors are typed classes, never strings. Logs are JSON lines on stdout.
Comments explain why, not what. British or Nigerian English in copy ("programme",
"organisation" in UI text; code identifiers stay American: `organization`).
