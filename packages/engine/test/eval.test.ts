import { describe, expect, it } from "vitest";
import { formatReport, loadEvalSet, runEval } from "../src/eval.js";

describe("engine eval", () => {
  const report = runEval(loadEvalSet());

  it("scores every labelled item", () => {
    expect(report.items).toBe(100);
    expect(report.opportunities).toBe(65);
    expect(formatReport(report)).toContain("eval: 100 items, 65 opportunities");
  });

  it("publishes no non-opportunity and writes no eligibility word (docs/05 Acceptance)", () => {
    expect(report.falsePublishes).toEqual([]);
    expect(report.eligibilityWordViolations).toEqual([]);
  });

  it("every opportunity's deadline label has a date exactly when its kind has one", () => {
    // Never guess a date: the labels themselves must follow the rule the extractor is held to.
    for (const { id, expected } of loadEvalSet().items) {
      if (!expected.isOpportunity) continue;
      const dated = expected.deadlineKind === "fixed" || expected.deadlineKind === "multiRound";
      if (expected.deadlineAt) expect(dated, id).toBe(true);
      if (expected.deadlineKind === "fixed") expect(expected.deadlineAt, id).toBeDefined();
    }
  });

  it("does not fall below today's accuracy", () => {
    // Floors, not targets: raise them when the rules improve. M3's gate is in docs/05 §5.
    const correct = (f: keyof typeof report.fields) => report.fields[f].correct;
    // Measured on the 100-item set, 2026-11-20 (M3.1; deadlines raised in M3.2).
    expect(correct("kind")).toBeGreaterThanOrEqual(60);
    expect(correct("deadlineKind")).toBeGreaterThanOrEqual(64);
    expect(correct("deadlineAt")).toBeGreaterThanOrEqual(26);
    expect(correct("locationMode")).toBeGreaterThanOrEqual(44);
    expect(correct("country")).toBeGreaterThanOrEqual(23);
    expect(correct("city")).toBeGreaterThanOrEqual(23);
    expect(report.deadlineDay.correct).toBeGreaterThanOrEqual(26);
  });

  it("meets the M3 gate on what the rules can be scored on (docs/05 §5)", () => {
    const rate = (f: keyof typeof report.fields) =>
      report.fields[f].correct / report.fields[f].total;
    expect(rate("deadlineAt")).toBeGreaterThanOrEqual(0.9);
    expect(rate("kind")).toBeGreaterThanOrEqual(0.9);
    expect(report.eligibilityWordViolations).toEqual([]);
  });
});
