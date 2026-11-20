import {
  type OpportunityInput,
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
 * Invariant 3 (docs/03 §4). Kind and location mode must be known, and an engine item whose
 * title marks it as a test waits for review. Then it is confidence and, for rules alone, a
 * stated date: rolling never publishes on rules.
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
  >,
): boolean {
  if (!input.kind || !input.locationMode) return false;
  // A maintainer entering a row by hand means it, whatever the title says.
  if (input.extractionMethod !== "manual" && TEST_TITLE.test(input.title)) return false;
  if (input.extractionMethod !== "rules") return input.confidence >= PUBLISH_THRESHOLD;
  return (
    input.confidence >= RULES_ONLY_PUBLISH_THRESHOLD && Boolean(input.deadlineAt ?? input.startsAt)
  );
}
