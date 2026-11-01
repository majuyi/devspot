import { type ExtractionMethod, type OpportunityDraft, OpportunityInput } from "@devspot/schema";
import type { z } from "zod";

export type ValidateContext = {
  organizationId: string;
  rawItemId?: string;
  confidence: number;
  extractionMethod: ExtractionMethod;
  discoveredVia: OpportunityInput["discoveredVia"];
};

/**
 * Stage 4 (docs/04 §1): the draft with the organization context merged in. Never throws: the
 * caller logs a failure with its field paths and counts it on the run.
 */
export function validateDraft(
  draft: OpportunityDraft,
  ctx: ValidateContext,
): z.ZodSafeParseResult<OpportunityInput> {
  return OpportunityInput.safeParse({ ...draft, ...ctx, extracted: draft });
}
