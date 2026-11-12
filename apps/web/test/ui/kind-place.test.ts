import { OpportunityKind } from "@devspot/schema";
import { describe, expect, it } from "vitest";
import { FAMILIES, KIND_FAMILY, KIND_LABEL, kindsOf } from "@/ui/kind";
import { placeLabel } from "@/ui/place";

describe("kinds", () => {
  it("puts every kind in exactly one of the five families", () => {
    const all = FAMILIES.flatMap(kindsOf).sort();
    expect(all).toEqual([...OpportunityKind.options].sort());
    expect(new Set(Object.values(KIND_FAMILY)).size).toBe(5);
  });

  it("uses British wording for the open-source programme", () => {
    expect(KIND_LABEL.ossProgram).toBe("Open-source programme");
  });
});

describe("placeLabel (01 §1)", () => {
  it.each([
    [{ locationMode: "remote", country: "NG", city: "lagos" }, "Remote"],
    [{ locationMode: "onsite", country: "NG", city: "port-harcourt" }, "Port Harcourt"],
    [{ locationMode: "hybrid", country: "NG", city: "lagos" }, "Lagos · Hybrid"],
    [{ locationMode: "onsite", country: "NG", city: null }, "Nigeria"],
    [{ locationMode: "onsite", country: null, city: null }, "Global"],
  ] as const)("%o reads %s", (o, label) => {
    expect(placeLabel(o)).toBe(label);
  });
});
