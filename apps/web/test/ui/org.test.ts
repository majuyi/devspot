import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OrgCategory } from "@devspot/schema";
import { describe, expect, it } from "vitest";
import {
  baseLabel,
  byCategory,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  CATEGORY_PLURAL,
  registryPath,
  worstHealth,
} from "@/ui/org";

const ROOT = resolve(import.meta.dirname, "../../../..");

describe("organisation health: the worst source's", () => {
  it.each([
    [["healthy", "erroring", "stale"], "erroring"],
    [["healthy", "stale", "new"], "stale"],
    [["healthy", "new"], "new"],
    [["healthy", "disabled"], "healthy"],
    [["disabled"], "disabled"],
    [[], "new"],
  ] as const)("%j is %s", (states, health) => {
    expect(worstHealth(states)).toBe(health);
  });
});

describe("categories", () => {
  it("every category is placed and worded once", () => {
    expect([...CATEGORY_ORDER].sort()).toEqual([...OrgCategory.options].sort());
    expect(Object.keys(CATEGORY_PLURAL).sort()).toEqual([...OrgCategory.options].sort());
    expect(Object.keys(CATEGORY_LABEL).sort()).toEqual([...OrgCategory.options].sort());
    expect(CATEGORY_PLURAL.ossProgram).toBe("Open-source programmes");
  });

  it("groups in the fixed order, most open first then by name, empty categories left out", () => {
    const org = (name: string, category: OrgCategory, openCount: number) => ({
      name,
      category,
      openCount,
    });
    const groups = byCategory([
      org("Zindi", "community", 2),
      org("Paga", "employer", 0),
      org("Kuda", "employer", 3),
      org("AfriLabs", "community", 2),
      org("Andela", "employer", 0),
    ]);
    expect(groups.map((g) => [g.category, g.orgs.map((o) => o.name)])).toEqual([
      ["employer", ["Kuda", "Andela", "Paga"]],
      ["community", ["AfriLabs", "Zindi"]],
    ]);
  });

  it("says where an organisation is based", () => {
    expect(baseLabel({ city: "port-harcourt", country: "NG" })).toBe("Port Harcourt");
    expect(baseLabel({ city: null, country: "NG" })).toBe("Nigeria");
    expect(baseLabel({ city: null, country: "US" })).toBe("US");
  });
});

describe('"Improve this entry" (M2.6 check)', () => {
  const dir = resolve(ROOT, "registry/organizations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".yaml") && !f.startsWith("_"));

  it("every organisation's registry file is where the link points", () => {
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) {
      const slug = /^slug:\s*(\S+)/m.exec(readFileSync(resolve(dir, file), "utf8"))?.[1];
      expect(slug, file).toBeDefined();
      // The link is built from the slug alone, so the file must be named after it.
      expect(registryPath(slug as string)).toBe(`registry/organizations/${file}`);
      expect(existsSync(resolve(ROOT, registryPath(slug as string)))).toBe(true);
    }
  });
});
