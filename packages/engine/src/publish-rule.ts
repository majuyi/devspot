import {
  type OpportunityInput,
  type OrgCategory,
  PUBLISH_THRESHOLD,
  RULES_ONLY_PUBLISH_THRESHOLD,
} from "@devspot/schema";

/**
 * Invariant 3 (docs/03 §4), on its own so the eval can apply exactly what the loader applies
 * without loading the database client.
 */
/**
 * A listing its own title calls a test ("Test Hackathon - Didit KYC", "Event (test)"). Some
 * also catch real roles ("Test Automation Engineer"); those only wait for review.
 */
export const TEST_TITLE =
  /^\W*(?:test|dummy)\b|\b(?:test|dummy) (?:hackathon|event|listing|challenge|competition|post|page|opportunity)\b|[([](?:test|dummy)[)\]]/i;

/**
 * ADR 0018 E: a job or internship on an employer's own listing, with no deadline stated.
 * Careers boards rarely state one, and a role cannot be shown with a wrong date when none is
 * shown ("Deadline not stated on the source page"); a role that leaves the board is closed
 * (`closeRemoved`). Rolling stays out: it is a stated kind of date, read as review.
 */
export function isUndatedRole(
  input: { kind?: OpportunityInput["kind"]; deadlineKind?: OpportunityInput["deadlineKind"] },
  orgCategory: OrgCategory | undefined,
): boolean {
  return (
    orgCategory === "employer" &&
    (input.kind === "job" || input.kind === "internship") &&
    input.deadlineKind === "unknown"
  );
}

/**
 * Invariant 3 (docs/03 §4). Kind and location mode must be known, and an engine item whose
 * title marks it as a test waits for review. Then it is confidence and, for rules alone, a
 * stated date or start, or an employer's role with none stated (isUndatedRole): rolling
 * never publishes on rules.
 */
export function meetsPublishRule(
  input: Pick<
    OpportunityInput,
    | "title"
    | "kind"
    | "locationMode"
    | "confidence"
    | "extractionMethod"
    | "deadlineAt"
    | "startsAt"
  > &
    Partial<Pick<OpportunityInput, "deadlineKind">>,
  orgCategory?: OrgCategory,
): boolean {
  if (!input.kind || !input.locationMode) return false;
  // A maintainer entering a row by hand means it, whatever the title says.
  if (input.extractionMethod !== "manual" && TEST_TITLE.test(input.title)) return false;
  if (input.extractionMethod !== "rules") return input.confidence >= PUBLISH_THRESHOLD;
  const dated = Boolean(input.deadlineAt ?? input.startsAt);
  return (
    input.confidence >= RULES_ONLY_PUBLISH_THRESHOLD && (dated || isUndatedRole(input, orgCategory))
  );
}
