# 03 · Data model

> **What Opus needs to know.** A thin relational spine in Postgres, with JSON only for the
> heterogeneous extraction output. Six tables carry the product: `Organization`, `Source`,
> `FetchRun`, `RawItem`, `Opportunity`, `Submission`, plus `Extraction` (cache) and
> `UsageMeter` (budget). Every shape is defined once as a Zod schema in `packages/schema` and
> mirrored in Prisma; enums are declared in both and a test asserts parity. Prisma 7 rules
> apply: `provider = "prisma-client"` with an `output`, URLs in `prisma.config.ts`, and the
> `@prisma/adapter-pg` driver adapter.

## 1. Entities and their relations

```
Organization 1──n Source 1──n FetchRun
                    │
                    └──n RawItem 1──n Opportunity n──1 Organization
                                          │
Submission n──1 Opportunity (optional)    └── duplicateOf (self)
Extraction (keyed by contentHash + model + promptVersion)
UsageMeter (one row per calendar month)
```

- **Organization** is CLIST's `Resource`: the unit of ingestion, sourced from
  `registry/organizations/<slug>.yaml`. The database row is a projection of the YAML; the YAML
  is the source of truth and `pnpm db:sync-registry` reconciles them.
- **Source** is one place an organization publishes: a feed URL, a sitemap, an HTML page with
  an adapter, an API. An organization has one or more. Health counters live here.
- **FetchRun** is one attempt to fetch one source. Append-only. Drives `/status` and alerts.
- **RawItem** is what a fetch found: one row per canonical URL per source, with the text and a
  content hash. Re-fetching an unchanged item updates `lastSeenAt` and nothing else.
- **Opportunity** is the product atom. It has a canonical URL, a slug, a kind, dates, a
  location, verbatim requirements, and a status. It links to the `RawItem` it came from or the
  `Submission` that introduced it.
- **Submission** is an inbound URL from the web form or, later, a WhatsApp forward. Pre-triage.
- **Extraction** caches LLM output by content hash so unchanged pages are never re-paid.
- **UsageMeter** counts LLM tokens per month for the budget guard.

## 2. Prisma schema

File: `packages/db/prisma/schema.prisma`. This is the complete M0 schema.

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum OrgCategory {
  employer
  ossProgram
  fellowshipFunder
  scholarshipFunder
  hackathonHost
  community
  trainingProvider
  accelerator
  government
  university
}

enum SourceKind {
  feed
  sitemap
  html
  api
  manual
}

enum Cadence {
  rolling
  monthly
  quarterly
  annual
  unpredictable
}

enum OpportunityKind {
  internship
  job
  fellowship
  scholarship
  grant
  hackathon
  ossProgram
  event
  competition
  accelerator
  bootcamp
}

enum DeadlineKind {
  fixed
  rolling
  multiRound
  unknown
}

enum LocationMode {
  remote
  onsite
  hybrid
}

enum OpportunityStatus {
  review
  published
  closed
  rejected
}

enum DiscoveredVia {
  feed
  sitemap
  html
  api
  submission
  whatsapp
  manual
}

enum ExtractionMethod {
  rules
  llm
  manual
}

enum SubmissionChannel {
  web
  whatsapp
  manual
}

enum SubmissionStatus {
  new
  merged
  rejected
  duplicate
}

model Organization {
  id           String      @id @default(cuid())
  slug         String      @unique
  name         String
  category     OrgCategory
  homepageUrl  String
  description  String?
  country      String      // ISO 3166-1 alpha-2 of the organization's base
  city         String?     // city slug from packages/schema CITIES, if the org is local
  logoUrl      String?
  enabled      Boolean     @default(true)
  registryHash String      // sha256 of the YAML file at last sync
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  sources       Source[]
  opportunities Opportunity[]

  @@index([country, category])
  @@map("organizations")
}

model Source {
  id             String     @id @default(cuid())
  organizationId String
  key            String     @unique // "<org-slug>/<source-name>", stable, from the YAML
  kind           SourceKind
  url            String
  adapter        String?    // module name under packages/engine/src/adapters, html/api only
  cadence        Cadence    @default(unpredictable)
  enabled        Boolean    @default(true)
  notes          String?

  // health, updated by the engine after every run
  lastRunAt            DateTime?
  lastOkAt             DateTime?
  lastYieldAt          DateTime? // last run with nNew > 0
  consecutiveEmpty     Int       @default(0)
  consecutiveErrors    Int       @default(0)
  baselineWeeklyYield  Float?    // exponential moving average of new items per week

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  fetchRuns    FetchRun[]
  rawItems     RawItem[]

  @@index([enabled, kind])
  @@map("sources")
}

model FetchRun {
  id         String    @id @default(cuid())
  sourceId   String
  startedAt  DateTime  @default(now())
  finishedAt DateTime?
  ok         Boolean
  httpStatus Int?
  nFound     Int       @default(0)
  nNew       Int       @default(0)
  nChanged   Int       @default(0)
  error      String?
  durationMs Int?

  source Source @relation(fields: [sourceId], references: [id], onDelete: Cascade)

  @@index([sourceId, startedAt(sort: Desc)])
  @@map("fetch_runs")
}

model RawItem {
  id           String    @id @default(cuid())
  sourceId     String
  canonicalUrl String
  contentHash  String    // sha256 of normalized text
  title        String?
  text         String    // extracted readable text, not HTML
  meta         Json?     // publishedAt, author, links, feed fields, adapter extras
  publishedAt  DateTime?
  firstSeenAt  DateTime  @default(now())
  lastSeenAt   DateTime  @default(now())
  seenCount    Int       @default(1)

  source        Source        @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  opportunities Opportunity[]

  @@unique([sourceId, canonicalUrl])
  @@index([contentHash])
  @@map("raw_items")
}

model Opportunity {
  id             String            @id @default(cuid())
  slug           String            @unique
  organizationId String
  rawItemId      String?
  submissionId   String?           @unique

  title          String
  kind           OpportunityKind
  summary        String?           // <= 280 chars, plain text, no claims about eligibility
  canonicalUrl   String            @unique // the organization's own page for this opportunity
  applyUrl       String?

  opensAt          DateTime?
  deadlineAt       DateTime?
  deadlineKind     DeadlineKind      @default(unknown)
  deadlineTimezone String?           // IANA, when the source states one
  startsAt         DateTime?         // events and programmes
  endsAt           DateTime?

  locationMode  LocationMode
  country       String?             // ISO alpha-2; null means not location-bound
  city          String?             // city slug; null with a country means nationwide
  venueName     String?
  venueAddress  String?
  lat           Float?
  lng           Float?
  geoSource     String?             // "nominatim" | "manual"
  regionsTags   String[]            // hints only: "africa", "west-africa", "global", "nigeria"

  requirementsText String?          // VERBATIM from the source. Never paraphrased. Rendered unmodified.
  tags             String[]
  extracted        Json?            // the full OpportunityDraft the loader accepted
  confidence       Float            // 0..1 overall
  fieldConfidence  Json?            // { deadlineAt: 0.9, kind: 0.7, ... }
  extractionMethod ExtractionMethod

  status        OpportunityStatus   @default(review)
  statusReason  String?
  discoveredVia DiscoveredVia
  identityKey   String              // normalized org+title+cycle, for cross-source dedupe
  duplicateOfId String?

  firstSeenAt    DateTime  @default(now())
  publishedAt    DateTime?
  lastVerifiedAt DateTime?
  closedAt       DateTime?
  reviewedAt     DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  organization Organization  @relation(fields: [organizationId], references: [id])
  rawItem      RawItem?      @relation(fields: [rawItemId], references: [id], onDelete: SetNull)
  submission   Submission?   @relation(fields: [submissionId], references: [id])
  duplicateOf  Opportunity?  @relation("Duplicates", fields: [duplicateOfId], references: [id])
  duplicates   Opportunity[] @relation("Duplicates")

  @@index([status, deadlineAt])
  @@index([status, kind, country, city])
  @@index([status, startsAt])
  @@index([organizationId, status])
  @@index([identityKey])
  @@map("opportunities")
}

model Submission {
  id          String            @id @default(cuid())
  url         String
  note        String?
  senderHint  String?           // free text the sender gave; never an identity we verify
  channel     SubmissionChannel
  ipHash      String?           // sha256(ip + daily salt), for rate limiting only
  receivedAt  DateTime          @default(now())
  status      SubmissionStatus  @default(new)
  reviewedAt  DateTime?

  opportunity Opportunity?

  @@index([status, receivedAt(sort: Desc)])
  @@map("submissions")
}

model Extraction {
  id            String   @id @default(cuid())
  contentHash   String
  model         String
  promptVersion String
  output        Json
  inputTokens   Int
  outputTokens  Int
  createdAt     DateTime @default(now())

  @@unique([contentHash, model, promptVersion])
  @@map("extractions")
}

model UsageMeter {
  period       String @id // "2026-09"
  inputTokens  Int    @default(0)
  outputTokens Int    @default(0)
  calls        Int    @default(0)
  @@map("usage_meters")
}
```

### Prisma 7 wiring

```ts
// packages/db/prisma.config.ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: env("DIRECT_URL") },   // migrations use the session pooler
});
```

```ts
// packages/db/src/client.ts
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL }); // pooled at runtime
export const db = new PrismaClient({ adapter });
```

## 3. Zod schemas (`packages/schema`)

One file per concern; every enum is a `z.enum` whose values are asserted equal to the Prisma
enum in `packages/db/test/enum-parity.test.ts`.

| Schema | Used by | Notes |
|---|---|---|
| `OrganizationYaml` | registry validation, `db:sync-registry` | The YAML shape; includes nested `sources[]` |
| `RawItemSchema` | engine fetch stage output | `url`, `title?`, `text`, `publishedAt?`, `meta?` |
| `OpportunityDraftSchema` | extract stage output, LLM structured output | Every field optional except `title` and `canonicalUrl`; each field carries a sibling confidence |
| `OpportunitySchema` | loader input after validation, API DTO | Required fields enforced here |
| `PreferencesSchema` | `/feed` cookie and query params | `{ v: 1, kinds: Kind[], city?: City, tags: string[], remoteOnly?: boolean }` |
| `ApiListParams` | `/api/v1/*` query parsing | cursor, limit (max 100), filters |
| `SnapshotSchema` | weekly export | `{ version, generatedAt, organizations[], opportunities[] }` |

`pnpm --filter @devspot/schema build` emits JSON Schema for `OpportunitySchema`,
`OrganizationYaml` and `SnapshotSchema` into `docs/schema/`. The API references these.

### Controlled vocabularies

**Cities** (`CITIES` in `packages/schema/src/cities.ts`): slug, display name, state, lat, lng.
Launch list: `lagos`, `abuja`, `ibadan`, `port-harcourt`, `enugu`, `kano`, `benin-city`,
`kaduna`, `jos`, `calabar`, `uyo`, `owerri`, `abeokuta`, `ilorin`, `akure`, `ile-ife`.
Adding a city is a one-line PR. `city = null` with `country = "NG"` means nationwide.

**Kinds** map to reader-facing labels and to the YouthOp gap: internships, jobs, hackathons
and open-source programmes are first-class here.

**Tags** are free strings, lower-kebab-case, normalized by the loader against an allowlist
that grows by PR (`packages/schema/src/tags.ts`): `backend`, `frontend`, `mobile`, `data`,
`ml`, `design`, `product`, `devops`, `security`, `web3`, `women-in-tech`, `students-only`,
`final-year`, `stipend`, `fully-funded`, `free`.

## 4. Invariants

These are product rules enforced in code and stated in tests:

1. `requirementsText` is stored exactly as extracted and rendered unmodified. No field ever
   states that a reader is eligible.
2. A `deadlineAt` is stored only when `deadlineKind = fixed` or `multiRound` and the date was
   found in the source text. `unknown` is shown as "deadline not stated". Rolling is shown as
   "rolling".
3. `status = published` requires: `title`, `kind`, `canonicalUrl`, `locationMode`,
   `organizationId`, and `confidence >= PUBLISH_THRESHOLD` (0.8 at M3; rules-only items at M1
   publish only when kind and one date are found by deterministic rules).
4. The engine writes `Opportunity` only through the loader. Fetchers and extractors return
   values; they do not import `db`.
5. `city` and `country` are filters; `regionsTags` are display hints and never filter.
6. `canonicalUrl` is unique. Two sources announcing one opportunity resolve to one row via
   `identityKey`; the second becomes `duplicateOf` the first and is never published.
7. An `Opportunity` past `deadlineAt` (or `endsAt` for events) by more than 24 hours becomes
   `closed` on the next verify pass, regardless of source state.

## 5. Indexing policy

Index for queries that exist in `docs/01-product-spec.md` and `docs/06-api-spec.md`, listed
above. Do not add an index in anticipation. When a query is slow, add the index in the same PR
as the query and note the `EXPLAIN` in the PR description.

## 6. Migration policy

- `prisma migrate dev` locally; commit the migration folder; `prisma migrate deploy` in CI
  before the app deploys (a GitHub Action step on `main`, using `DIRECT_URL`).
- Additive first. A destructive change (drop or rename) ships as two migrations across two
  releases: add and backfill, then drop.
- Never edit an applied migration. Never run `prisma db push` against production.
- Enums change by PR to both Prisma and Zod, and the parity test must pass.

## Acceptance

- [ ] `prisma validate` passes; `prisma migrate diff --from-empty` reproduces the schema above.
- [ ] `packages/schema` exports every schema in the table, and `pnpm build` emits three JSON Schema files under `docs/schema/`.
- [ ] Enum parity test passes.
- [ ] Invariants 1 through 7 each have at least one unit test named after them.
