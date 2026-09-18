# CLIST Codebase Audit

**Repository:** `aropan/clist` · **Commit:** `a7a09115` · **Branch:** master (clean, no local commits)
**Reviewed:** 2026-09-04 · **Method:** static, read-only · **Findings:** 17 (2 critical)

> A competitive-programming aggregator with unusually disciplined infrastructure and
> documentation — and a publicly-served legacy PHP tier carrying an unauthenticated
> SQL injection.

---

## The read

CLIST is a 15-year-lineage scraping platform that aggregates contests and standings from
~85 competitive-programming judges into one calendar, leaderboard, and rating system. It is
two applications sharing one PostgreSQL database: a modern Django 6.1 / Python 3.14 app
under `src/`, and the original PHP application under `legacy/` that still serves schedule
parsing and a public site.

The Django half is in strong shape. The last eight months of history show a deliberate
modernization program — `uv`-locked dependencies, Python 3.14 syntax already in use,
self-hosted observability (Loki/Alloy/Grafana/Bugsink/Healthchecks), offline HTTP-replay
regression fixtures for parsers, a PostgreSQL 18 migration with a documented backup and
rollback procedure, and a genuinely excellent `docs/` tree written for both humans and
coding agents. Very little of this is typical for a personal-scale project.

The risk is concentrated in three places, in descending order: the legacy PHP tier, which
has never received the same attention and is publicly reachable; the absence of any CI gate,
so the 296 tests and three configured formatters run only when someone remembers; and the
size of a handful of core functions, where a single 2,000-line function carries the entire
standings-ingestion pipeline.

### At a glance

| Metric | Value | Note |
|---|---:|---|
| Python | 71,405 | lines, excluding migrations |
| Migrations | 15,614 | 601 files across 13 apps |
| Legacy PHP | 12,737 | ~100 host modules |
| Frontend | 31,111 | JS + CSS + templates |
| Judge parsers | 85 | Django modules |
| Dependencies | 116 | 241 locked packages |
| Tests | 296 | 8,523 lines, 7 apps |
| Commits | 1,006 | since May 2019 |

---

## Architecture

### Two applications, one database

Both tiers connect to the same PostgreSQL 18 cluster and read the same `clist_resource` /
`clist_contest` tables. The split is functional, not historical-only: legacy PHP still owns
**contest schedule parsing** (`legacy/update.php` driving `legacy/module/<host>/index.php`),
while Django owns **standings parsing**, ratings, accounts, the web app and the public API.
A judge may have a parser in one codebase, the other, or both.

Nginx fronts both: `clist.by` → uWSGI/Daphne (Django), `legacy.clist.by` → php-fpm. That
means the legacy tier is not an internal batch job — it is publicly addressable HTTP.

### The ingestion pipeline

Everything flows through cron into RQ. `config/cron` fires `parse_statistic
--split-by-resource` every minute; per-resource work is enqueued onto four Redis-backed RQ
queues (`system`, `default`, `parse_statistics`, `parse_accounts`) with timeouts from 2
minutes to 24 hours. Each judge module implements `BaseModule.get_standings()`, returning a
`result` dict keyed by account plus a `problems` list; `parse_statistic` then upserts
`Statistics` rows, links accounts to coders, fans out notifications and subscriptions, and
triggers rating and problem-rating recalculation.

Scraping goes through `utils/requester` — a hand-rolled HTTP client with cookie jars, a
scored rotating proxy pool, a file cache, and a curl fallback. This is the layer the offline
test fixtures intercept.

### Data model

The spine is five models: `Resource` (a judge) → `Contest` → `Statistics` (one row per
account per contest) → `Account` (per-resource identity) → `Coder` (the unified user).
Semi-structured scraped data lives in `JSONField` columns — `Statistics.addition` carries
per-problem results, ratings and medals; `Resource.info` carries per-judge parser
configuration. That choice is what makes one schema absorb 85 heterogeneous judges, and it
is also why `clist/templatetags/extras.py` has grown to 2,609 lines of field-shape
interpretation.

Denormalized counters are pervasive (`n_contests`, `n_total_solved`, `n_gold`,
`resource_rank`, …) and maintained by dedicated cron commands rather than signals — a
reasonable trade for a read-heavy leaderboard site.

### Codebase composition (lines of code)

```
Python (app)   71,405  ████████████████████████████████████████
Migrations     15,614  █████████
JS             14,396  ████████
Legacy PHP     12,737  ███████
Templates      10,500  ██████
Tests           8,523  █████
CSS             6,215  ███
Docs + skills   1,310  █
```

### Runtime topology

| Tier | Runs | Notes |
|---|---|---|
| Application | `uwsgi ×6` · `daphne` (fcgi) · 4× `rqworker` · cron · redis · logrotate | All under one supervisord in the `prod` container |
| Data | `postgres:18` + `pg_repack 1.5.3` · redis (cache) · redis (RQ, RDB) | Weekly repack via in-container cron |
| Edge | `nginx:stable-alpine` + crond · certbot | Deliberately independent of DB health |
| Legacy | `php:8-fpm` + cron | Schedule parsers + public `legacy.clist.by` |
| Observability | loki · alloy · grafana · bugsink · healthchecks · netdata | Entirely self-hosted; Sentry replaced by Bugsink |

---

## What is genuinely strong

### Offline parser regression testing

The best idea in the repository. `dump_parser_fixture` records a real scrape into
`httpcache.json.gz` (Git LFS), plus a trimmed `db.json` and a normalized golden
`expected_standings.json`. Replay disables network access outright — a cache miss raises
`AssertionError: unexpected network access` — and the recorder scans bodies and metadata for
credentials before writing. It even has a `--suggest` mode that audits which parser variants
(by `kind`, `standings_kind`, `is_rated`, series, medals) lack coverage. The legacy PHP side
has the equivalent, wrapped in `faketime` so year-inferring modules stay deterministic.

### Documentation written for two audiences

`AGENTS.md` is a short operating contract, symlinked to `CLAUDE.md`, `GEMINI.md`,
`.cursorrules` and `.github/copilot-instructions.md`, linking into nine focused `docs/` files
plus four `SKILL.md` playbooks under the cross-tool `.agents/skills/` path. It is accurate,
specific about risk, and honest about its own gaps — `docs/testing.md` states plainly that
the GitHub workflow only runs CodeQL.

### Operational discipline

Healthchecks monitors are config-as-code in `config/healthchecks/provision.py` and pinged by
both cron runners through a shared `healthchecks.bash`, posting the failing command's log
tail as the ping body. `collectstatic` builds into a temp dir and `rsync --delay-updates`s
into the shared volume so nginx never sees a partially-cleared static root. The backup tool
verifies every archive with `pg_restore --list` and writes `SHA256SUMS` before renaming out
of `.in-progress`. No secrets are committed; `.gitignore`, `.dockerignore` and docker secrets
are all consistent.

---

## Findings

Seventeen findings, ranked by severity. Locations are `file:line` at commit `a7a09115`.

### F1 — Unauthenticated SQL injection in the public legacy app · **CRITICAL**

`legacy/index.php:122 → :209, :211, :235` · reachable via `legacy.clist.by`
(`config/nginx/conf.d/legacy.conf:29`)

`$arid` is taken straight from `$_GET['arid']` (and `$_POST`, which line 74 copies into
`$_GET`) with no validation or escaping, then interpolated into three queries via
`implode(',', $arid)` — including `'not clist_contest.resource_id in (' . implode(',', $arid)
. ')'`. Passing `arid` as an array survives the only guard on the path (`count($arid) == 0`).
The queries run through `pg_query`, which permits multiple statements per call, so this is
not read-only in impact, and both tiers share one database and one database role.

**Fix** — Coerce every element to an integer before interpolation (`array_map('intval',
$arid)`) and drop non-numeric entries, or route the value through `$db->escapeArray()`, which
already exists at `db.class.php:117` and is used correctly a few lines away for `byhosts`.
Treat this as the one change to make before anything else in this report.

### F2 — PHP object injection via an attacker-controlled cookie · **CRITICAL**

`legacy/index.php:122` — `unserialize(stripslashes($_COOKIE['arid']))`

The app serializes `arid` into a cookie at line 101 and deserializes it unconditionally at
line 122. `unserialize()` on client-supplied data instantiates arbitrary classes and triggers
their magic methods; Smarty is already loaded at that point by `config.php:17`, and Smarty is
a well-known source of POP gadget chains. Exploitability depends on which gadgets the loaded
Smarty version exposes, which I did not attempt to determine — but the pattern itself is the
vulnerability class, not a theoretical one.

**Fix** — Stop serializing structured data into a cookie. Store the resource ids as a
comma-separated string of integers and parse with `explode` + `intval`. If serialization must
stay, use `json_decode`, or at minimum `unserialize($v, ['allowed_classes' => false])`.

### F3 — `create_function()` was removed in PHP 8, so `/resources/*` fatals · **HIGH**

`legacy/index.php:134` · route: `config/nginx/conf.d/legacy.conf:15`
(`/resources/(.*) → ?byhosts=$1`) · `legacy/Dockerfile:1` (`php:8-fpm`)

`create_function()` was deprecated in PHP 7.2 and removed in PHP 8.0. The legacy container
runs `php:8-fpm`, so any request that sets `byhosts` — including the rewritten public
`/resources/<hosts>` URL — hits an undefined-function fatal. This whole feature is currently
dead in production.

**Fix** — Replace with an arrow function: `array_map(fn($r) => $r['id'], $arid)`. One line,
and it restores a route that is presumably still linked.

### F4 — Legacy tier renders PHP errors and failed SQL to the browser · **HIGH**

`legacy/config.php:3–5` · `legacy/db.class.php:5, :44`

`config.php` sets `display_errors=1`, `display_startup_errors=1` and `error_reporting(E_ALL)`
unconditionally, and `db.class.php` hardcodes `$is_debug = true`, so a failed query prints
the **entire SQL statement** into the response body before `exit(1)`. On its own this is
filesystem-path and schema disclosure; combined with F1 it converts a blind injection into a
directly-readable one.

**Fix** — Drive both flags from an environment variable defaulting to off, log the failing
SQL to `legacy/logs/` instead of the response, and return a generic 500.

### F5 — No CI gate on tests, lint, or formatting · **HIGH**

`.github/workflows/` — only `codeql-analysis.yml`

The repository has 296 tests, offline parser fixtures designed explicitly to be CI-friendly,
and three pinned formatters wired through `mise` tasks (Ruff 0.16.2, Biome 2.5.7,
PHP-CS-Fixer 3.95.18). None of it runs on push or pull request. `docs/testing.md`
acknowledges this, so it is a known gap rather than an oversight — but it is the single
highest-leverage thing missing, and F7/F9 below are exactly the class of defect a CI run
would have caught on the commit that introduced them.

**Fix** — One workflow with a `postgres:18` service that runs `ruff check`, `ruff format
--check`, `biome format`, `php-cs-fixer check`, then `./manage.py test`. The parser-fixture
suite needs no network, so it runs as-is.

### F6 — `calculate_global_rating` cannot import; its dependency is not installed · **MEDIUM**

`src/ranking/management/commands/calculate_global_rating.py:11–12` · documented at
`docs/development-environment.md:49`

The command imports `elo_mmr_py`, which appears in neither `pyproject.toml` nor `uv.lock` nor
the `Dockerfile`. Running it raises `ImportError` immediately. It is not in `config/cron`, so
nothing is silently failing in production — but it is listed in the command table in
`docs/development-environment.md` as if it works.

**Fix** — Either add the package to `pyproject.toml` and relock, or delete the command and
its documentation row. Leaving a command that cannot import is the worst of the three.

### F7 — Core scraping path imports `distutils`, removed from the stdlib in 3.12 · **MEDIUM**

`src/utils/requester/__init__.py:27` — `from distutils.util import strtobool`

The project requires Python 3.14, where `distutils` no longer exists. This currently resolves
only through the `setuptools` compatibility shim, which is itself on a deprecation path. It
sits in the requester — the module every one of the 85 parsers depends on — so when the shim
goes, all scraping stops at import time.

**Fix** — Inline it. `strtobool` is four lines, and a local helper removes both the
deprecation and the reason `setuptools` is a runtime dependency at all.

### F8 — 2,000-line function carries the entire standings pipeline · **MEDIUM**

`src/ranking/management/commands/parse_statistic.py:218` — `parse_statistic()`, 2,023 lines ·
`src/ranking/utils.py:445` — `update_stage()`, 702 lines

`parse_statistic()` is 2,023 lines with an estimated cyclomatic complexity around 668, and
contains sixteen nested closures (`update_problems_info`, `update_account_info`,
`update_submissions`, `process_subscriptions`, …) that close over roughly a dozen loop
variables. Across the codebase, 99 functions exceed 100 lines and 149 exceed complexity 20 —
but these two are outliers by an order of magnitude, and they are the two most
business-critical functions in the project. The practical cost is that the ingestion path is
effectively untestable in units: `test_parse_statistic.py` is 183 lines against 2,023.

**Fix** — Don't refactor it wholesale; the repo's own `AGENTS.md` rules out large refactors,
and rightly. Extract the closures outward one at a time as new fixtures land, starting with
the ones that touch no loop state (`update_problems_first_ac`, `update_statistic_stats`).

### F9 — `ruff check` is not clean; only `ruff format` was ever applied · **MEDIUM**

`src/clist/api/authentication.py:1–8` · `src/ranking/management/modules/{codeforces,acmp,acm_timus}.py` · `src/utils/aes.py`

`.ruff.toml` selects `I` (isort) along with `B`, `SIM`, `UP`, `RET` and others, but at least
five files have import blocks that violate it. The July 2026 style commits ran `ruff format`,
which does not sort imports; the lint half was never run to completion. Whatever
`B`/`SIM`/`UP` would report has also never been surfaced.

**Fix** — Run `ruff check --fix`, review the diff, and land it as one style commit. Then F5
keeps it clean.

### F10 — 86 indexes on a single table · **MEDIUM**

`src/ranking/models.py:284` — `Account.Meta.indexes`

`Account` declares 70 `Meta` indexes plus 15 `db_index=True` fields plus a `unique_together`.
Most are two- and three-column `DescNullsLastIndex` permutations built to serve every
sortable leaderboard column, and many are near-duplicates differing only in sort direction —
which PostgreSQL can usually satisfy with a backward index scan on the existing one. On a
table this size that is significant write amplification on every parse and a large share of
the database's disk.

**Fix** — Query `pg_stat_user_indexes` in production for `idx_scan = 0`, and drop
ascending/descending pairs where only one direction is ever used. The `logify.PgStat` model
already collects statistics of this kind.

### F11 — Parser fixture coverage is 24% · **MEDIUM**

`src/ranking/tests/fixtures/parsers/` — 20 of 85 modules · `legacy/tests/fixtures/` — 19 of ~100

The regression harness is excellent and the covered set is well chosen (Codeforces, AtCoder,
LeetCode, CodeChef, ICPC Global, Kaggle, uoj, ucup …). But 65 Django parsers and ~80 legacy
modules have no fixture, and parsers are the component that breaks most often, since the
failure is caused externally by sites the project does not control.

**Fix** — `dump_parser_fixture --suggest` already enumerates the gap without touching the
network. Work down that list by traffic, and make a fixture part of the definition of done in
the `add-parser` skill.

### F12 — Six apps have no tests at all · **LOW**

`src/{chats,donation,events,favorites,my_oauth,notes}/`

Two of these matter more than the others. `my_oauth` is the OAuth layer and the repository's
own risk map marks it **high**; `events` is 2,682 lines including a 370-line,
complexity-101 `event()` view handling team registration and join requests.

**Fix** — Test `my_oauth` token exchange and `events` team-status transitions first; the rest
are small enough to leave.

### F13 — Unparameterized f-string in a `RawSQL` annotation · **LOW**

`src/ranking/views.py:1638`

`raw_sql = f"""json_array_elements(...'_{groupby}'...)"""` interpolates a non-constant into
SQL. In practice it is well gated: `groupby` must be a key of the server-built
`fields_to_select` and must satisfy `is_ip_field()`, i.e. be `ips`, `n_ips`, or start with
`whois_`. So reaching it requires a malicious field name inside scraped standings JSON. Low
risk, but the only unparameterized interpolation in the Django tier.

**Fix** — Pass the field as a bound parameter, or match it against an explicit tuple of the
three permitted names.

### F14 — A DB round-trip on every request, including static and health checks · **LOW**

`src/pyclist/middleware.py:162` — `StatementTimeoutMiddleware`

The middleware issues `SET statement_timeout TO '30s'` before every response, which forces a
connection and a round trip even for views that touch no database. `CONN_MAX_AGE=60` keeps
the connection warm, so the cost is one extra round trip rather than a connect — but it is
paid unconditionally.

**Fix** — Set the timeout once per connection via the `connection_created` signal, or put it
in `DATABASES['default']['OPTIONS']['options'] = '-c statement_timeout=30s'` so PostgreSQL
applies it at connect.

### F15 — Documentation drift in the repository map · **LOW**

`docs/repository-map.md`

The map lists `src/legacy/` as an "in-Django proxy bridge to the PHP legacy app" — that
directory does not exist, and no such bridge is wired into `pyclist/urls.py`. It also states
`ranking/management/commands/` holds 16 commands; there are 18. Everything else I checked was
accurate, including the 85-parser count and every command named in `config/cron`.

**Fix** — Delete the `src/legacy/` row and correct the count. The file asks to be updated
when structure drifts.

### F16 — Undeclared direct dependency on `six` · **LOW**

`src/clist/api/authentication.py:3` · `src/clist/templatetags/extras.py:17`

`six` is imported directly but appears in `uv.lock` only as a transitive dependency of other
packages. If those packages drop it, two first-party modules break — one of them the API
authentication layer.

**Fix** — Both are Python 3-only files; remove the import and the two or three `six` call
sites rather than declaring the dependency.

### F17 — 1,371 lines of vendored 2008 pure-Python AES for one cookie · **LOW**

`src/utils/aes.py` — used only by `src/ranking/management/modules/codeforces.py:118`

A copy of SlowAES, carried to solve the Codeforces `RCPC` anti-bot challenge. It is used to
reproduce a client-side computation, not to protect anything, so this is not a vulnerability
— but it is 1.9% of the non-migration Python in the repository, unmaintained since 2008, and
holds the largest single file in `utils/`.

**Fix** — Replace with `cryptography`'s AES-CBC primitive, which the transitive dependency
tree already contains, and delete the file.

---

## Suggested sequence

1. **Patch the legacy tier (F1–F4).** Four small, independent edits in two files. F1 and F2
   are the only findings here that warrant same-day attention, and F3 restores a broken public
   route while you are already in the file.
2. **Add the CI workflow (F5).** Lint, format-check and the offline test suite. This is what
   stops F7 and F9 from recurring, and it makes every step below verifiable.
3. **Clear the dependency defects (F6, F7, F16).** Three isolated fixes: declare or delete
   `elo_mmr_py`, inline `strtobool`, drop `six`. None touches behavior.
4. **Run `ruff check --fix` (F9).** One style commit, landed after CI exists so the result
   stays clean.
5. **Grow fixture coverage (F11), then extract from `parse_statistic` (F8).** In that order.
   The fixtures are what make the extraction safe, and the repo's own contract says small
   reviewable changes — so extract one closure per pull request.
6. **Audit index usage in production (F10).** Needs live `pg_stat_user_indexes` data, so it
   cannot be done from the repository alone. Highest payoff of the remaining items on write
   throughput and disk.

---

## What I did not verify

This was a static read of the working tree at `a7a09115`. Docker, `uv`, Ruff and Biome are
not installed on this machine, so **nothing was executed**: no tests were run, no linters, no
management commands, no migrations. Every claim above comes from reading source,
configuration and git history.

Specific limits worth naming. Complexity figures are from my own AST pass, not a calibrated
tool, so read them as relative magnitudes rather than exact numbers — and ten files could not
be parsed at all because they use PEP 758 `except A, B:` syntax that this machine's Python
3.13 rejects, which is itself confirmation the codebase has genuinely moved to 3.14. F1 and
F2 were confirmed by reading the data flow and the nginx routing, not by sending a request to
a live host. F10's cost is inferred from the index declarations, not measured. Runtime
behavior — actual query plans, RQ queue depth, scrape success rates, production error volume
— is invisible from here; the project's own Grafana and Bugsink instances are where that
lives.

---

*Repository: aropan/clist · commit a7a09115 · branch master, no local commits*
*Working tree clean apart from four untracked `.DS_Store` files*
*Read-only static analysis · 2026-09-04*
