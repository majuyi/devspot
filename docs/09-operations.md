# 09 · Operations

> **What Opus needs to know.** Free tiers everywhere: Supabase (Postgres), Vercel Hobby
> (web), GitHub Actions (engine, keepalive, snapshot). Two inactivity timers must be kept
> alive. Secrets live only in Vercel and GitHub. This file is the runbook.

## 1. Environment variables

| Name | Where | Value |
|---|---|---|
| `DATABASE_URL` | Vercel, local | Supabase transaction pooler, port 6543, `?pgbouncer=true&connection_limit=1` on Vercel |
| `DIRECT_URL` | GitHub (migrations), local | Supabase session pooler, port 5432. Used by `prisma.config.ts` only |
| `ENGINE_DATABASE_URL` | GitHub | Session pooler URL for the `engine` role (see 3) |
| `ADMIN_TOKEN` | Vercel | 32+ random bytes, base64 |
| `REVALIDATE_SECRET` | Vercel, GitHub | 32+ random bytes |
| `NEXT_PUBLIC_SITE_URL` | Vercel | `https://<domain>` |
| `ANTHROPIC_API_KEY` | GitHub | optional until M3 |
| `EXTRACTION_LLM` | GitHub variable | `0` or `1` |
| `EXTRACTION_MONTHLY_TOKEN_BUDGET` | GitHub variable | default `2000000` |
| `EXTRACTION_MAX_ITEMS_PER_RUN` | GitHub variable | default `60` |

`.env.example` lists all names with empty values. Local development uses `.env` (git-ignored)
loaded by `dotenv` in `prisma.config.ts` and by Next.js.

## 2. Supabase setup

1. Create a project in the region closest to Lagos that Supabase offers (Frankfurt or
   London today). Production is `devspot`, reference `rlfppkooucslfyajxnan`, London
   (`eu-west-2`), pooler host `aws-0-eu-west-2.pooler.supabase.com`.
2. Settings → Database → Connection string: copy the transaction pooler (6543) as
   `DATABASE_URL` and the session pooler (5432) as `DIRECT_URL`. The direct host may be blocked
   on some networks; the session pooler works everywhere.
3. Run `pnpm --filter @devspot/db migrate:deploy` from a machine with `DIRECT_URL` set.
4. Enable the daily keepalive (section 5). Free projects pause after 7 days without API
   requests.
5. Backups: the free plan has no point-in-time recovery. `backup.yml` runs `pg_dump` weekly
   through the session pooler and uploads the encrypted dump as a workflow artifact retained
   90 days; the weekly data snapshot on GitHub Releases is the long-term copy of the public
   data.

## 3. Database roles

Create a restricted role for the engine once, so an Actions secret cannot damage the app.
Pass a SCRAM verifier rather than the password, so the password never appears in SQL or
logs (production's passwords live in the maintainer's Keychain under `devspot-supabase`):

```sql
create role engine login password 'SCRAM-SHA-256$4096:<salt>$<storedKey>:<serverKey>';
```

The grants live in `packages/db/prisma/grants.sql`, which `migrate.yml` runs as `postgres`
after every `prisma migrate deploy`, so a new table never misses them. The file also takes
away Supabase's default Data API access: by default `anon` and `authenticated` get full
read and write on every new table in `public`, which would let anyone holding the public
key edit the data. They keep only `select` on `usage_meters`, for the keepalive. Supabase's
advisor reports "RLS disabled" on these tables; with no grants, that is expected.

Migrations run as the default `postgres` role.

**Connection strings.** Through the pooler the user is `<role>.<project ref>`. The pooler's
certificate is not in Node's trust store, so `ENGINE_DATABASE_URL` (read by node-postgres)
ends `?uselibpqcompat=true&sslmode=require`: encrypted, certificate not verified, as libpq's
`require`. `DIRECT_URL` (read by Prisma's migrate, psql and pg_dump) ends `?sslmode=require`.

## 4. Vercel setup

1. Import the GitHub repo. Framework preset Next.js, root directory `apps/web`, build
   command `pnpm turbo build --filter @devspot/web`, install command
   `corepack enable && pnpm install --frozen-lockfile`.
2. Add the environment variables from section 1 for Production and Preview. Preview shares
   the production database read-only in effect because previews never run the engine.
3. Domains: add the chosen domain at M5. Until then the `*.vercel.app` URL is fine.
4. Hobby plan notes: non-commercial only (this project qualifies), cron once a day (unused),
   serverless function timeout 60s on the default runtime (fine, the app only reads).

## 5. GitHub Actions

| Workflow | Cron | Secrets | Notes |
|---|---|---|---|
| `ci.yml` | on push and PR | none | lint, typecheck, test, build, `prisma validate`, OpenAPI validate |
| `engine.yml` | `17 */6 * * *` | `ENGINE_DATABASE_URL`, `ANTHROPIC_API_KEY`, `REVALIDATE_SECRET` (from M2) | runs (which syncs the registry first), verifies, uploads the JSON-line logs; fails when a source turns `erroring` |
| `keepalive.yml` | `0 5 * * *` | `SUPABASE_URL`, `SUPABASE_ANON_KEY` | `GET /rest/v1/usage_meters?select=period&limit=1` with the publishable key resets the pause timer; then `keepalive` marker commit if no commit in 41 days |
| `snapshot.yml` | `0 6 * * 0` | `GITHUB_TOKEN` (default), `ENGINE_DATABASE_URL` | release `data-YYYY-WW` |
| `backup.yml` | `0 4 * * 0` | `DIRECT_URL`, `BACKUP_PASSPHRASE` | `pg_dump` (17, in Docker: the runner's client is older than the server) of `public`, `gpg --symmetric` → artifact; the passphrase is in the Keychain |
| `migrate.yml` | on push to `main` touching `packages/db/prisma/migrations/**` or `grants.sql`, and by hand | `DIRECT_URL` | `prisma migrate deploy`, then `grants.sql` (section 3) |

Scheduled workflows in a public repo are disabled after 60 days without a commit. The
keepalive commit prevents that; if it ever happens, re-enable from the Actions tab and check
`/status` for the gap.

## 6. Runbooks

**A source is `erroring`.** Open `/status`, click the source, read the last `FetchRun.error`.
Run `pnpm engine run --source <key> --dry-run` locally. If the page moved, update the URL in
the YAML. If the markup changed, fix the adapter, re-record the fixture with
`pnpm engine record --source <key>`, review the diff, commit. If the organization stopped
publishing, set `enabled: false` with a note and date.

**A source is `stale` but not erroring.** Check the page by hand. If it genuinely has no news,
set `cadence: annual` or `unpredictable` so the baseline stops flagging it. If it has items we
missed, the selector is wrong: treat as erroring.

**Supabase paused the project.** Restore from the dashboard (one click on the free plan),
then verify the keepalive workflow ran; the usual cause is the workflow being disabled.

**Actions disabled the schedules.** Re-enable each workflow from the Actions tab. Make a
commit. Check that `keepalive.yml` is enabled first.

**A wrong deadline was published.** Find it in the All tab of `/admin` and fix it there
(which sets `reviewedAt` so the machine will not overwrite it), then add the case to
`packages/engine/test/eval/` so the extractor is tested against it.

**The engine run is slow or times out.** The job has a 30-minute limit. Check for a source
with many new URLs (a sitemap that changed shape). Run with `--limit` to confirm. Consider
narrowing the sitemap `include` glob.

**Rotate a secret.** Generate, update in Vercel or GitHub, redeploy or re-run. `ADMIN_TOKEN`
rotation logs everyone out (there is only one person).

## 7. Costs (expected, monthly)

| Item | Cost |
|---|---|
| Supabase free | $0 (500 MB database, plenty for years of this data) |
| Vercel Hobby | $0 |
| GitHub Actions public repo | $0 |
| OpenFreeMap tiles | $0 |
| Nominatim geocoding (M4) | $0 at under 1 request per second with caching |
| Anthropic API (M3+) | ~$5 to $10 at the default budget |
| Domain (M5) | ~$12 a year |

## Acceptance

- [ ] `.env.example` matches section 1 exactly.
- [ ] All six workflows exist and pass a `workflow_dispatch` run.
- [ ] The `engine` role cannot `delete` from `opportunities` (tested once by hand and noted in the PR).
- [ ] Every runbook step references a command or page that exists.
