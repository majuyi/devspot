# 05 · Extraction and trust

> **What Opus needs to know.** Extraction turns a `RawItem` into an `OpportunityDraft` with a
> confidence per field. Deterministic rules run on every item and are the only extractor at
> M1. LLM extraction (Claude Opus 5, structured outputs) is added at M3 behind
> `EXTRACTION_LLM=1`, runs only on new or changed content, is cached by content hash, and is
> capped by a monthly token budget. Nothing in this stage may assert eligibility or invent a
> date. Low confidence goes to the review queue, not to the public.

## 1. Rule-based extraction (`extract/rules.ts`)

Runs first, always. Each rule returns a value and a confidence in [0, 1].

| Field | Rule | Confidence |
|---|---|---|
| `kind` | Keyword scoring over title then text. Weighted phrase lists per kind (`internship`, `graduate programme`, `fellowship`, `scholarship`, `grant`, `hackathon`, `open source`/`GSoC`/`Outreachy`, `meetup`/`conference`/`summit`, `competition`/`challenge`, `accelerator`, `bootcamp`). The organization's category sets a prior (an `ossProgram` org defaults to `ossProgram`). | 0.9 when title matches one kind only; 0.6 when text-only; 0.4 when prior-only |
| `deadlineAt`, `deadlineKind` | Regex families anchored on `deadline`, `closes`, `apply by`, `applications close`, `last date`, within 80 characters of a parseable date (`3 October 2026`, `Oct 3, 2026`, `03/10/2026` interpreted day-first, ISO). `rolling` when "rolling" or "until filled" appears near "applications". `multiRound` when "round" and two dates appear. Else `unknown`. Dates in the past relative to `publishedAt` are discarded. | 0.85 anchored with year; 0.6 anchored without year (year inferred as next occurrence); 0 otherwise |
| `startsAt`, `endsAt` | For `event` and `bootcamp` kinds: date ranges (`3–5 Oct 2026`, `October 3 to 5`), single dates near `on`/`date:` | 0.8 with year; 0.5 without |
| `locationMode`, `city`, `country` | Dictionary: city names and aliases from `CITIES` (Lagos, Ikeja, Yaba → lagos; Abuja, FCT → abuja …), "remote", "virtual", "online", "hybrid", "Nigeria", "nationwide", "Africa", "global". `remote` wins if "remote"/"virtual"/"online" appears in title; hybrid if "hybrid"; onsite when a city matched and no remote word. | 0.9 title, 0.7 text, 0.3 org default |
| `venueName`, `venueAddress` | Lines following `venue:`, `location:`, `at ` followed by a proper noun, for events | 0.6 |
| `requirementsText` | The block under a heading matching `requirements`, `eligibility`, `who can apply`, `criteria`, up to the next heading or 1,500 characters. Copied verbatim, including line breaks. | 0.9 heading match; 0 otherwise (left null, never synthesized) |
| `applyUrl` | First link whose text matches `apply`, `register`, `submit`, `sign up`, or whose href contains `apply`, `register`, `forms.`, `airtable`, `typeform`. | 0.8 |
| `tags` | Allowlist match over title and text | 0.7 |
| `summary` | First paragraph of text, trimmed to 280 characters at a sentence boundary. Rules never write a summary that mentions eligibility words. | 0.5 |
| `regionsTags` | "africa", "west africa", "nigeria", "global" occurrences | 0.6 |

Overall confidence at rules-only: `min(kind, max(deadline, startsAt), locationMode)` with a
0.15 penalty when `requirementsText` is null. At M1, publish threshold for rules-only items is
0.75, which in practice means kind found in the title and a dated deadline or start.

## 2. LLM extraction (`extract/llm.ts`), M3

### Request

```ts
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { OpportunityDraft } from "@devspot/schema";

const client = new Anthropic();
const response = await client.messages.parse({
  model: "claude-opus-5",
  max_tokens: 4000,
  thinking: { type: "adaptive" },
  output_config: { effort: "medium", format: zodOutputFormat(OpportunityDraft) },
  system: SYSTEM_PROMPT,             // frozen text, PROMPT_VERSION bumps on change
  messages: [{ role: "user", content: buildUserMessage(org, rawItem) }],
});
const draft = response.parsed_output; // null on parse failure → fall back to rules
```

- The Zod schema for structured output has every field optional and a sibling
  `<field>Confidence: number` (0 to 1) plus `evidence: { field: string; quote: string }[]`,
  where each quote must be a verbatim substring of the input. The engine verifies every quote
  by substring search and zeroes the confidence of any field whose evidence is not found.
- `buildUserMessage` includes: organization name, category, country and homepage; the
  `RawItem.title`, `canonicalUrl`, `publishedAt`; the text truncated to 12,000 characters; and
  today's date. Nothing else.
- Cache: before calling, look up `Extraction` by `(contentHash, model, PROMPT_VERSION)`. After,
  store the output and token counts. Unchanged pages are never re-sent.
- Budget: `UsageMeter` for the current month; skip the LLM (rules only, item goes to review)
  when `inputTokens + outputTokens` would exceed `EXTRACTION_MONTHLY_TOKEN_BUDGET` (default
  2,000,000, roughly $8 at Opus 5 pricing with a 3:1 input to output ratio). Per run, at most
  `EXTRACTION_MAX_ITEMS_PER_RUN` (default 60) items.
- Errors: a `RateLimitError` waits and retries twice; any other API error falls back to the
  rules draft and records `extractionMethod = rules` with the error in the run log.

### System prompt (PROMPT_VERSION = "2026-09-v1")

```
You extract structured facts about a single opportunity from text published by an
organization. Return only what the text states. Rules:
- Dates: return a date only if the text states it. If the year is missing, use the next
  occurrence relative to the given publish date and lower the confidence. If no deadline is
  stated, set deadlineKind to "unknown" and leave deadlineAt empty. Never estimate.
- requirementsText: copy the organization's own requirement or eligibility wording verbatim,
  including line breaks. Do not summarize, reorder or add to it. If none, leave empty.
- Never state or imply who is eligible. summary describes what the opportunity is, in one
  or two sentences, without the words eligible, qualify, or open to.
- locationMode: remote only if the text says remote, virtual or online. city only from the
  provided city list. country as ISO alpha-2 only when the text names a country.
- kind: one of the listed kinds. If it is a news article, a past event, or not an
  opportunity, set isOpportunity to false.
- For every field you fill, add an evidence entry with a verbatim quote from the text.
```

### Confidence and thresholds

- Overall = weighted mean: deadline or start 0.35, kind 0.25, locationMode 0.15,
  requirements 0.15, title 0.10. Fields without evidence contribute 0.
- `PUBLISH_THRESHOLD = 0.8`. Below it, `status = review`. `isOpportunity = false` with
  confidence over 0.7 → the item is skipped and logged; otherwise → review.
- Any deadline the LLM returned that the rules also found is compared; disagreement by more
  than a day sends the item to review regardless of confidence.

## 3. Review queue behaviour

- Reviewed rows are final for the machine: the loader updates only `lastVerifiedAt` on them.
- The reviewer sees the evidence quotes highlighted in the source text. A field with no
  evidence is shown with a warning and empty by default.
- "Reject" with reason `not-an-opportunity` adds the `canonicalUrl` to a per-source ignore list
  in `Source.notes` so it is not re-queued after the next content change.

## 4. Identity and duplicates

- `identityKey` as defined in the engine spec. Same key across sources → the later one is
  `review` with `duplicateOfId` set. The reviewer merges (keeps the earlier, marks the later
  `rejected` with reason `duplicate`) or splits (clears `duplicateOfId`).
- Submissions whose URL canonicalizes to an existing `canonicalUrl` are auto-marked
  `duplicate`.

## 5. Evaluation (gate for M3)

- `packages/engine/test/eval/` holds 100 hand-labelled items (`RawItem` text + expected
  fields), built from real fixtures during M1 and M2.
- `pnpm engine eval` runs rules and, with `--llm`, the LLM on all 100 and reports per-field
  accuracy, deadline exact-match rate, and eligibility-word violations (must be zero).
- M3 ships when deadline exact match is 90%+ on items with a stated deadline, kind accuracy
  is 90%+, and fewer than 1 in 5 published items needed a correction in a week of review.

## Acceptance

- [ ] Rules extractor has a table-driven test per field with at least 10 cases each, including negatives (a news article, a closed listing, a past date).
- [ ] With `EXTRACTION_LLM=0`, a full run makes zero calls to the Anthropic API (asserted by a test that stubs the client).
- [ ] With `EXTRACTION_LLM=1`, re-running on unchanged content makes zero API calls (cache hit asserted).
- [ ] The evidence check zeroes a field whose quote is not in the text (unit test).
- [ ] No extracted `summary` contains "eligible", "qualify" or "open to" (test over the eval set).
