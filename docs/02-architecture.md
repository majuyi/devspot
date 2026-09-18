# 02 · Architecture

> **What Opus needs to know.** One pnpm/Turborepo monorepo, all TypeScript. Three workspace
> packages (`schema`, `db`, `engine`) and one app (`web`). The engine is a cron job that runs in
> GitHub Actions every six hours and writes to Supabase Postgres through Prisma. The web app on
> Vercel reads the same database and renders everything server-side. Dependencies point one way:
> `web → db → schema` and `engine → db → schema`. The engine never imports from the app.
> Versions below are pinned; do not upgrade a major without an ADR.

## 1. System overview

```
 registry/organizations/*.yaml ──sync──▶ Organization, Source rows
                                              │
   GitHub Actions (every 6h)                  ▼
   ┌────────────────────────────────────────────────────────────────┐
   │ engine: fetch → dedupe → extract → validate → load → verify   │
   │         → health                                               │
   └───────────────┬────────────────────────────────────────────────┘
                   │ Prisma (pooled URL)
                   ▼
            Supabase Postgres  ◀──────── Prisma (pooled URL) ────── apps/web on Vercel
                   │                                                  ├─ public pages (SSR + ISR)
                   │  weekly                                          ├─ /feed (cookie prefs)
                   ▼                                                  ├─ /admin (token cookie)
        GitHub Release asset: data snapshot JSON                      └─ /api/v1 (read-only REST)
```

Nothing runs between engine runs except the web app serving reads. There is no queue, no
worker, no websocket, no background service. When that stops being true, write an ADR first.

## 2. Stack, pinned (verified 2026-09-18)

| Layer | Choice | Version | Why this and not the alternative |
|---|---|---|---|
| Runtime | Node.js | 22 LTS (`>=22.12`) | Vercel and Actions default; Prisma 7 requires 20.19+ |
| Package manager | pnpm via Corepack | 10.x | Workspace-native, strict, fast. `corepack enable pnpm` on a fresh machine |
| Monorepo | Turborepo | 2.10 | Task graph and caching across four packages; one `pnpm check` |
| Language | TypeScript | 5.9.x, `strict`, `noUncheckedIndexedAccess` | TS 7 (the Go compiler) is out but the ecosystem's type packages are not verified against it; revisit in an ADR after M2 |
| Schema | Zod | 4.x | Single source of truth for every shape crossing a boundary; emits JSON Schema for the API and snapshot |
| ORM | Prisma | 7.10 (client and CLI) | Typed queries, migrations, the model Dami already knows. Prisma 8 is an RC; upgrade by ADR once GA |
| Database | Supabase Postgres | free plan | Managed, backed up, pooled. Two URLs: transaction pooler (6543) for runtime, session pooler (5432) for migrations |
| Web | Next.js App Router, React | 16.3, 19.3 | SSR and ISR for the public archive; route handlers for the API |
| Styling | Tailwind CSS, shadcn/ui | 4.x, latest | Tokens in CSS variables, components copied into the repo, no runtime dependency |
| HTTP (engine) | undici | 8.x | Node's own fetch implementation with `MockAgent`, which is the record/replay seam |
| Feeds | feedsmith | 2.x | RSS 2.0, Atom, JSON Feed with typed output; falls back to rss-parser only if a feed breaks it |
| HTML | cheerio | 1.x | jQuery-style selection for adapter modules |
| Map | MapLibre GL + OpenFreeMap tiles | 6.x | Free vector tiles, no API key, no usage cap, permissive terms |
| LLM | `@anthropic-ai/sdk` | 0.126+ | Structured outputs via `client.messages.parse` with a Zod schema; model `claude-opus-5` |
| Tests | Vitest | 5.x | Workspace-aware, fast, one runner for all packages |
| Lint and format | Biome | 2.x | One tool, one config, fast enough to run on every commit |
| Scheduling | GitHub Actions | | Cron every 6 hours; Vercel Hobby cron is once a day and cannot run long jobs |
| Hosting | Vercel Hobby | | Free for non-commercial; ISR and edge caching for free |
| Email (later) | Resend | | Free tier covers a weekly digest for thousands |

## 3. Repository layout

```
.
├── registry/
│   └── organizations/<slug>.yaml   # one file per organization; validated by packages/schema
├── packages/
│   ├── schema/                     # Zod schemas + enums + JSON Schema emitter. No runtime deps but zod.
│   ├── db/                         # Prisma schema, migrations, client singleton, registry sync script
│   └── engine/                     # the pipeline and its CLI; fixtures under test/fixtures
├── apps/
│   └── web/                        # Next.js app: public pages, /feed, /admin, /api/v1
├── docs/                           # this spec set; docs/schema holds emitted JSON Schema
├── .github/workflows/              # ci.yml, engine.yml, keepalive.yml, snapshot.yml
├── .claude/skills/                 # Claude Code skills for recurring tasks
├── CLAUDE.md · CONTRIBUTING.md · README.md · LICENSE (Apache-2.0)
└── package.json · pnpm-workspace.yaml · turbo.json · biome.json · tsconfig.base.json
```

Package names use the scope `@devspot/*` until the public name is chosen.

### The dependency rule

```
apps/web    ──▶ @devspot/db ──▶ @devspot/schema
packages/engine ──▶ @devspot/db ──▶ @devspot/schema
```

- `schema` imports nothing from the workspace.
- `db` imports `schema` only (for enum parity and the registry sync).
- `engine` and `web` never import each other. Shared logic lives in `schema` or `db`.
- Anything crossing this line is a design error and CI fails the build (enforced by a
  Biome `noRestrictedImports` rule and by `turbo.json` task inputs).

## 4. Environments

| Env | Database | Web | Engine | Purpose |
|---|---|---|---|---|
| local | Postgres in Docker (`docker compose up db`) or a personal Supabase project | `pnpm dev` | `pnpm engine run --source <slug> --dry-run` | Development. Fixtures mean the engine test suite needs no database |
| ci | Postgres service container | build only | fixture tests, network disabled | Every PR |
| preview | Supabase prod (read) | Vercel preview | none | PR previews of the app |
| production | Supabase prod | Vercel production | GitHub Actions on `main` | Live |

### Environment variables (full list in `docs/09-operations.md`)

`DATABASE_URL` (pooled, `?pgbouncer=true`), `DIRECT_URL` (session pooler, migrations only),
`ADMIN_TOKEN`, `REVALIDATE_SECRET`, `ANTHROPIC_API_KEY` (optional), `EXTRACTION_LLM` (`0`/`1`),
`EXTRACTION_MONTHLY_TOKEN_BUDGET`, `NEXT_PUBLIC_SITE_URL`.

## 5. Scheduling and the two inactivity timers

| Workflow | Trigger | Does |
|---|---|---|
| `ci.yml` | push, pull_request | install, lint, typecheck, test, build, `prisma validate` |
| `engine.yml` | cron `17 */6 * * *`, manual | `pnpm engine run` against production; then `POST /api/revalidate` with `REVALIDATE_SECRET` |
| `keepalive.yml` | cron daily | one `SELECT 1` through the REST endpoint (resets Supabase's 7-day pause) and, if no commit in 41 days, a marker commit to `.github/keepalive` (resets Actions' 60-day cron disable) |
| `snapshot.yml` | cron weekly Sunday | `pnpm engine snapshot` and upload `opportunities-YYYY-WW.json` + `organizations-YYYY-WW.json` as a GitHub Release asset |

Both timers are dead-man switches aimed at this project's main failure mode, going quiet. The
keepalive is mandatory from M1. `/status` shows the last successful engine run so a stalled
pipeline is visible to readers, not just to the maintainer.

## 6. Data flow between engine and app

- The engine writes `Opportunity` rows with `status` (`review` or `published`) and never touches
  rendering. After a run it calls the app's `POST /api/revalidate` so ISR pages refresh at once
  rather than at the next TTL.
- Public pages are ISR with a 15-minute TTL as a floor; the revalidate webhook is the ceiling.
- `/feed` reads a preferences cookie (`prefs=v1.<base64 json>`) and renders server-side;
  the same preferences are encodable as query params so a feed is shareable.
- `/api/v1` reads the database directly with Prisma and returns DTOs validated by `schema`.
  The weekly snapshot is the same DTOs, whole, as one file.

## 7. Security model

- **Public surface has no auth.** No accounts in v1. No forms except `/submit` (M4), which
  writes a `Submission` row with rate limiting by IP and a honeypot field.
- **`/admin`** is gated by `ADMIN_TOKEN`: a login page sets an HTTP-only, `SameSite=Strict`
  cookie containing an HMAC of the token; middleware checks it on `/admin/*` and
  `/api/admin/*`. One maintainer. Upgrade path: Supabase Auth with an email allowlist, when a
  second reviewer exists (ADR required).
- **Secrets** live in Vercel and GitHub Actions secrets only. `.env.example` lists names,
  never values. The engine's database credential in Actions is the pooled URL of a dedicated
  Postgres role with write access to engine tables only (role setup in `09-operations.md`).
- **API** is read-only, CORS `*`, rate-limited per IP at 60 requests a minute via an in-memory
  token bucket per instance (good enough on Hobby; Upstash is the upgrade path).
- **Scrapers** identify themselves with a `User-Agent` naming the project and a contact URL,
  respect `robots.txt`, and never exceed one request per second per host.

## 8. Anti-goals, restated for the executor

Do not add: a queue (Inngest, BullMQ, RQ), user accounts, a second API layer (tRPC, GraphQL),
a search index (Postgres full-text is enough), a recommendation model, a mobile app, a
headless browser (Playwright) before an ADR shows a specific source needs it, or a Python
package. If a task seems to need one of these, stop and write the ADR first.

## Acceptance

- [ ] `pnpm check` runs lint, typecheck, test and build across all packages from a clean clone.
- [ ] No import crosses the dependency rule (CI fails if it does).
- [ ] `engine.yml`, `keepalive.yml` and `snapshot.yml` exist and are documented in `09-operations.md`.
- [ ] Every pinned version above matches `package.json` in the corresponding package.
