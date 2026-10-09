import { describe, expect, it } from "vitest";
import { formatRegistryIssue, RegistryValidationError, validateRegistry } from "../src/index.js";

const org = (slug: string, extra: Record<string, unknown> = {}) => ({
  slug,
  name: "Example Org",
  category: "employer",
  homepageUrl: "https://example.org",
  country: "NG",
  sources: [{ name: "careers", kind: "feed", url: "https://example.org/feed" }],
  ...extra,
});

describe("validateRegistry", () => {
  it("accepts valid files and keeps the file name", () => {
    const r = validateRegistry([{ file: "hng.yaml", raw: org("hng") }]);
    expect(r.issues).toEqual([]);
    expect(r.organizations.map((o) => o.file)).toEqual(["hng.yaml"]);
  });

  it("names the file and the field for a malformed file", () => {
    const raw = org("acme", {
      sources: [{ name: "site", kind: "html", url: "https://acme.example" }],
    });
    const { issues } = validateRegistry([{ file: "acme.yaml", raw }]);
    expect(issues).toEqual([
      { file: "acme.yaml", path: "sources.0.adapter", message: "html sources need an adapter" },
    ]);
    expect(formatRegistryIssue(issues[0] as (typeof issues)[0])).toBe(
      "acme.yaml: sources.0.adapter: html sources need an adapter",
    );
  });

  it("reports a YAML syntax error against its file", () => {
    const { issues } = validateRegistry([{ file: "bad.yaml", parseError: "bad indentation" }]);
    expect(issues).toEqual([{ file: "bad.yaml", path: "(yaml)", message: "bad indentation" }]);
  });

  it("rejects a slug that does not match the file name", () => {
    const { issues } = validateRegistry([{ file: "acme.yaml", raw: org("acme-inc") }]);
    expect(issues[0]?.path).toBe("slug");
  });

  it("rejects a duplicate slug", () => {
    const { organizations, issues } = validateRegistry([
      { file: "acme.yaml", raw: org("acme") },
      { file: "acme.yaml", raw: org("acme") },
    ]);
    expect(organizations).toHaveLength(1);
    expect(issues[0]?.message).toMatch(/duplicate/);
  });

  it("carries every issue in RegistryValidationError's message", () => {
    const err = new RegistryValidationError([
      { file: "a.yaml", path: "name", message: "too short" },
      { file: "b.yaml", path: "country", message: "ISO 3166-1 alpha-2, uppercase" },
    ]);
    expect(err.message).toBe(
      "a.yaml: name: too short\nb.yaml: country: ISO 3166-1 alpha-2, uppercase",
    );
  });
});
