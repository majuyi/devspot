# 06 · Public API and data snapshot

> **What Opus needs to know.** A read-only JSON API under `/api/v1`, implemented as Next.js
> route handlers that query Prisma and return DTOs validated by `@devspot/schema`. Cursor
> pagination, explicit filters, `Cache-Control` for CDN caching, an OpenAPI 3.1 document
> generated from the same Zod schemas, and a weekly snapshot of the whole dataset published as
> a GitHub Release asset. Breaking changes bump the path version; the snapshot carries a
> `version` field.

## 1. Conventions

- Base path `/api/v1`. JSON only. UTF-8. All timestamps ISO 8601 in UTC.
- `Cache-Control: public, s-maxage=900, stale-while-revalidate=3600` on every GET. The engine's
  revalidate call purges the Vercel cache for `/api/v1/*` too.
- CORS: `Access-Control-Allow-Origin: *`, GET and OPTIONS only.
- Rate limit: 60 requests per minute per IP, `429` with `Retry-After`. Headers
  `X-RateLimit-Limit`, `X-RateLimit-Remaining`.
- Errors: `{ error: { code: string, message: string } }` with codes `bad_request`, `not_found`,
  `rate_limited`, `internal`.
- Pagination: `?limit=` (default 30, max 100) and `?cursor=` (opaque base64url of the last
  row's sort key and id). Responses carry `nextCursor: string | null`.
- Only `published` and `closed` opportunities are ever returned. `review` and `rejected` do not
  exist to the API.

## 2. DTOs

```ts
type OpportunityDto = {
  id: string; slug: string; url: string;                 // url = https://<site>/o/<slug>
  title: string; kind: OpportunityKind; summary: string | null;
  organization: { slug: string; name: string; url: string };
  canonicalUrl: string; applyUrl: string | null;
  opensAt: string | null; deadlineAt: string | null; deadlineKind: DeadlineKind;
  deadlineTimezone: string | null; startsAt: string | null; endsAt: string | null;
  locationMode: LocationMode; country: string | null; city: string | null;
  venue: { name: string | null; address: string | null; lat: number | null; lng: number | null } | null;
  regionsTags: string[]; tags: string[];
  requirementsText: string | null;                        // verbatim
  status: "published" | "closed";
  firstSeenAt: string; publishedAt: string | null; lastVerifiedAt: string | null; closedAt: string | null;
};

type OrganizationDto = {
  slug: string; name: string; url: string; category: OrgCategory; homepageUrl: string;
  description: string | null; country: string; city: string | null; logoUrl: string | null;
  openCount: number;
  sources: { key: string; kind: SourceKind; url: string; health: "healthy" | "stale" | "erroring" | "new" | "disabled"; lastOkAt: string | null }[];
};
```

`extracted`, `confidence`, `fieldConfidence`, `identityKey`, `rawItemId` and `submissionId`
are internal and never serialized.

## 3. Endpoints

| Method and path | Query | Returns |
|---|---|---|
| `GET /api/v1/opportunities` | `q`, `kinds` (csv), `city`, `country`, `remote` (`1`), `tags` (csv), `org`, `status` (`published` default, `closed`, `all`), `closingWithin` (days), `updatedSince` (ISO), `sort` (`deadline`, `new`, `updated`), `limit`, `cursor` | `{ items: OpportunityDto[], nextCursor }` |
| `GET /api/v1/opportunities/{slug}` | | `OpportunityDto` or 404 |
| `GET /api/v1/events` | `city`, `from` (ISO date, default today), `to`, `tags`, `limit`, `cursor` | `{ items: OpportunityDto[], nextCursor }` where `kind = event`, ordered by `startsAt` |
| `GET /api/v1/organizations` | `category`, `country`, `city`, `limit`, `cursor` | `{ items: OrganizationDto[], nextCursor }` |
| `GET /api/v1/organizations/{slug}` | | `OrganizationDto` |
| `GET /api/v1/organizations/{slug}/opportunities` | `status`, `limit`, `cursor` | same shape as the list |
| `GET /api/v1/meta` | | `{ version: "1", generatedAt, counts: { organizations, sources, openOpportunities }, lastEngineRunAt, cities: [...], kinds: [...], tags: [...] }` |
| `GET /api/v1/openapi.json` | | OpenAPI 3.1 document |
| `GET /calendar.ics` | `kinds`, `city`, `tags` | iCalendar feed of deadlines and events (not under `/api`, used by calendar apps) |
| `GET /o/{slug}/calendar.ics` | | one VEVENT |

Internal, not part of the contract: `POST /api/revalidate` (header `x-revalidate-secret`),
`POST /api/prefs`, `POST /api/submit`, `/api/admin/*`.

## 4. OpenAPI generation

`apps/web/src/api/openapi.ts` builds the document from the Zod DTOs using
`zod-openapi` (or `@asteasolutions/zod-to-openapi`, pick one and pin it) and serves it at
`/api/v1/openapi.json`. The `/api` docs page renders it with a small client-side renderer
(Scalar or Redoc, loaded only on that page). The document is also written to
`docs/schema/openapi.json` at build time so it is versioned.

## 5. Weekly snapshot

`snapshot.yml` runs `pnpm engine snapshot --out dist/` every Sunday and uploads to a GitHub
Release tagged `data-YYYY-WW`:

- `opportunities.json`: `{ version: "1", generatedAt, items: OpportunityDto[] }` for all
  published and closed items.
- `organizations.json`: `{ version: "1", generatedAt, items: OrganizationDto[] }`.
- `SHA256SUMS`.

Consumers (bots, university pages, other projects) can use the snapshot with no API calls.
Breaking changes to a DTO bump `version` and the API path together; additive changes do not.

## 6. Versioning rules

- Adding a field or an enum value: allowed within v1; document in `CHANGELOG.md`.
- Removing or renaming a field, changing a type, changing pagination semantics: `/api/v2`, with
  v1 kept alive for 6 months.

## Acceptance

- [ ] Every endpoint has a route handler test that validates the response against the DTO schema.
- [ ] `GET /api/v1/opportunities?city=lagos&kinds=event` returns only Lagos or remote events.
- [ ] `/api/v1/openapi.json` validates with an OpenAPI 3.1 validator in CI.
- [ ] The snapshot files validate against `docs/schema/snapshot.schema.json`.
- [ ] A `review` opportunity is a 404 on the detail endpoint and absent from lists.
