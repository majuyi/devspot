# devspot (code name)

An open-source engine and web app that indexes opportunities for early-career tech people
in Nigeria: internships, jobs, fellowships, scholarships, grants, hackathons, open-source
programmes, events, competitions, accelerators and bootcamps. One promise: **a reader will
not miss a deadline they were eligible for.**

Status: **M0 · Foundation** (see `docs/08-milestones.md`). Nothing is deployed yet.

## How it works

```
registry/ (YAML, one file per organization)
   → engine (GitHub Actions, every 6h): fetch → dedupe → extract → validate → load → verify → health
   → Postgres (Supabase)
   → web app (Next.js on Vercel): browse, feed by city and kind, calendar, events, organizations, status
   → API /api/v1 and a weekly JSON snapshot
```

## Quick start

```sh
corepack enable
pnpm install
docker compose up -d db
cp .env.example .env
pnpm db:migrate
pnpm db:sync-registry
pnpm test
```

## Read the specs

| Doc | What |
|---|---|
| [00 Vision](docs/00-vision.md) | Premise, audience, promise, non-goals |
| [01 Product spec](docs/01-product-spec.md) | Every route and rule of the web app |
| [02 Architecture](docs/02-architecture.md) | Stack, layout, dependency rule, scheduling, security |
| [03 Data model](docs/03-data-model.md) | Prisma schema, Zod schemas, invariants |
| [04 Engine](docs/04-engine-spec.md) | Pipeline stages, adapter contract, fixtures, health |
| [05 Extraction](docs/05-extraction-spec.md) | Rules, LLM extraction, confidence, review |
| [06 API](docs/06-api-spec.md) | REST endpoints, DTOs, snapshot |
| [07 Design system](docs/07-design-system.md) | Tokens, type, components |
| [08 Milestones](docs/08-milestones.md) | The task list with gates |
| [09 Operations](docs/09-operations.md) | Env, secrets, workflows, runbooks |
| [ADRs](docs/adr/README.md) | Decisions and why |

Contributing: the most useful thing you can do is [add an organization](CONTRIBUTING.md).
AI coding agents start at [`CLAUDE.md`](CLAUDE.md).

Licence: Apache-2.0 (code). The registry is CC0.
