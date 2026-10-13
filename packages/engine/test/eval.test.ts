import { describe, expect, it } from "vitest";
import { formatReport, loadEvalSet, runEval } from "../src/eval.js";

describe("engine eval", () => {
  const report = runEval(loadEvalSet());

  it("scores every labelled item", () => {
    expect(report.items).toBe(20);
    expect(report.opportunities).toBe(13);
    expect(formatReport(report)).toContain("eval: 20 items, 13 opportunities");
  });

  it("publishes no non-opportunity and writes no eligibility word (docs/05 Acceptance)", () => {
    expect(report.falsePublishes).toEqual([]);
    expect(report.eligibilityWordViolations).toEqual([]);
  });

  it("does not fall below today's accuracy", () => {
    // Floors, not targets: raise them when the rules improve. M3's gate is in docs/05 §5.
    const correct = (f: keyof typeof report.fields) => report.fields[f].correct;
    expect(correct("kind")).toBeGreaterThanOrEqual(12);
    expect(correct("deadlineKind")).toBeGreaterThanOrEqual(13);
    expect(correct("deadlineAt")).toBeGreaterThanOrEqual(9);
    expect(correct("locationMode")).toBeGreaterThanOrEqual(7);
  });
});
