import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ApiListParams,
  CITIES,
  decodePreferences,
  encodePreferences,
  JSON_SCHEMA_TARGETS,
  normalizeTags,
  OpportunityDraft,
  OpportunityDto,
  OpportunityInput,
  OpportunitySnapshot,
  OrganizationDto,
  OrganizationSnapshot,
  OrganizationYaml,
  Preferences,
  RawItemInput,
  renderJsonSchema,
  SnapshotFile,
} from "../src/index.js";

const opportunityDto = {
  id: "op_1",
  slug: "hng-internship-2026",
  url: "https://devspot.example/o/hng-internship-2026",
  title: "HNG Internship 2026",
  kind: "internship",
  summary: null,
  organization: { slug: "hng", name: "HNG Tech", url: "https://devspot.example/org/hng" },
  canonicalUrl: "https://hng.tech/internship",
  applyUrl: null,
  opensAt: null,
  deadlineAt: null,
  deadlineKind: "unknown",
  deadlineTimezone: null,
  startsAt: null,
  endsAt: null,
  locationMode: "remote",
  country: "NG",
  city: null,
  venue: null,
  regionsTags: [],
  tags: ["backend"],
  requirementsText: null,
  status: "published",
  firstSeenAt: "2026-10-01T00:00:00Z",
  publishedAt: "2026-10-01T00:00:00Z",
  lastVerifiedAt: null,
  closedAt: null,
};

const organizationDto = {
  slug: "hng",
  name: "HNG Tech",
  url: "https://devspot.example/org/hng",
  category: "trainingProvider",
  homepageUrl: "https://hng.tech",
  description: null,
  country: "NG",
  city: null,
  logoUrl: null,
  openCount: 1,
  sources: [
    {
      key: "hng/site",
      kind: "html",
      url: "https://hng.tech/internship",
      health: "healthy",
      lastOkAt: null,
    },
  ],
};

describe("OrganizationYaml", () => {
  const valid = {
    slug: "hng",
    name: "HNG Tech",
    category: "trainingProvider",
    homepageUrl: "https://hng.tech",
    country: "NG",
    sources: [{ name: "site", kind: "html", url: "https://hng.tech/internship", adapter: "hng" }],
  };
  it("accepts a valid organization", () => {
    expect(OrganizationYaml.safeParse(valid).success).toBe(true);
  });
  it("rejects an html source without an adapter", () => {
    const r = OrganizationYaml.safeParse({
      ...valid,
      sources: [{ name: "site", kind: "html", url: "https://hng.tech" }],
    });
    expect(r.success).toBe(false);
  });
  it("rejects an unknown city", () => {
    expect(OrganizationYaml.safeParse({ ...valid, city: "atlantis" }).success).toBe(false);
  });
});

describe("OpportunityDraft", () => {
  it("defaults deadlineKind to unknown and never requires a date", () => {
    const r = OpportunityDraft.parse({ title: "Backend Intern", canonicalUrl: "https://x.org/a" });
    expect(r.deadlineKind).toBe("unknown");
    expect(r.deadlineAt).toBeUndefined();
  });
  it("rejects a draft without a canonical URL", () => {
    expect(OpportunityDraft.safeParse({ title: "Backend Intern" }).success).toBe(false);
  });
});

describe("RawItemInput", () => {
  it("accepts a url and text", () => {
    expect(RawItemInput.safeParse({ url: "https://x.org/a", text: "Apply now" }).success).toBe(
      true,
    );
  });
  it("rejects empty text", () => {
    expect(RawItemInput.safeParse({ url: "https://x.org/a", text: "" }).success).toBe(false);
  });
});

describe("OpportunityInput", () => {
  const valid = {
    title: "Backend Intern",
    canonicalUrl: "https://x.org/a",
    organizationId: "org_1",
    kind: "internship",
    locationMode: "remote",
    confidence: 0.9,
    extractionMethod: "rules",
    discoveredVia: "feed",
  };
  it("accepts a draft with the loader's required fields", () => {
    expect(OpportunityInput.safeParse(valid).success).toBe(true);
  });
  it("requires kind, which the draft leaves optional", () => {
    const { kind: _, ...withoutKind } = valid;
    expect(OpportunityInput.safeParse(withoutKind).success).toBe(false);
  });
});

describe("OpportunityDto", () => {
  it("accepts a published opportunity", () => {
    expect(OpportunityDto.safeParse(opportunityDto).success).toBe(true);
  });
  it("rejects a review item, which is never public", () => {
    expect(OpportunityDto.safeParse({ ...opportunityDto, status: "review" }).success).toBe(false);
  });
});

describe("Preferences", () => {
  it("round-trips through the cookie encoding", () => {
    const p = Preferences.parse({ v: 1, kinds: ["event"], city: "lagos", tags: [] });
    expect(decodePreferences(encodePreferences(p))).toEqual(p);
  });
  it("rejects an unknown preferences version", () => {
    expect(Preferences.safeParse({ v: 2, kinds: [], tags: [] }).success).toBe(false);
  });
  it("ignores garbage", () => {
    expect(decodePreferences("v1.not-base64-json")).toBeUndefined();
  });
});

describe("cities and tags", () => {
  it("has unique slugs", () => {
    expect(new Set(CITIES.map((c) => c.slug)).size).toBe(CITIES.length);
  });
  it("normalizes tags against the allowlist", () => {
    expect(normalizeTags(["Backend", " ML ", "nonsense"])).toEqual(["backend", "ml"]);
  });
});

describe("ApiListParams", () => {
  it("parses comma lists and coerces limit", () => {
    const r = ApiListParams.parse({ kinds: "event, internship", limit: "50" });
    expect(r.kinds).toEqual(["event", "internship"]);
    expect(r.limit).toBe(50);
  });
  it("rejects a limit over 100", () => {
    expect(ApiListParams.safeParse({ limit: "101" }).success).toBe(false);
  });
});

describe("snapshots", () => {
  const head = { version: "1", generatedAt: "2026-10-04T06:00:00Z" };
  it("accepts both release files as a SnapshotFile", () => {
    const opportunities = { ...head, items: [opportunityDto] };
    const organizations = { ...head, items: [organizationDto] };
    expect(OpportunitySnapshot.safeParse(opportunities).success).toBe(true);
    expect(OrganizationSnapshot.safeParse(organizations).success).toBe(true);
    expect(SnapshotFile.safeParse(opportunities).success).toBe(true);
    expect(SnapshotFile.safeParse(organizations).success).toBe(true);
  });
  it("rejects an unknown snapshot version", () => {
    expect(SnapshotFile.safeParse({ ...head, version: "2", items: [] }).success).toBe(false);
  });
  it("keeps OrganizationDto valid on its own", () => {
    expect(OrganizationDto.safeParse(organizationDto).success).toBe(true);
  });
});

describe("emitted JSON Schema", () => {
  const dir = resolve(import.meta.dirname, "../../../docs/schema");
  it.each(Object.entries(JSON_SCHEMA_TARGETS))("docs/schema/%s is current", (file, schema) => {
    expect(readFileSync(resolve(dir, file), "utf8")).toBe(renderJsonSchema(schema));
  });
});
