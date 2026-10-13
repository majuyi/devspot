import { type FetchResult, RawItemInput } from "@devspot/schema";
import type { Adapter } from "../adapter.js";
import { ADAPTERS } from "../adapters/index.js";
import type { FetchSource } from "../fetch.js";
import type { HttpClient } from "../http.js";

/** The registry names an adapter that `src/adapters` does not have. */
export class AdapterNotFound extends Error {
  override readonly name = "AdapterNotFound";
  constructor(
    readonly sourceKey: string,
    readonly adapter: string | undefined,
  ) {
    super(
      adapter
        ? `source ${sourceKey} names adapter "${adapter}", which is not in src/adapters`
        : `source ${sourceKey} has no adapter`,
    );
  }
}

/** An adapter returned an item that is not a RawItemInput. */
export class AdapterOutputInvalid extends Error {
  override readonly name = "AdapterOutputInvalid";
  constructor(
    readonly adapter: string,
    readonly index: number,
    readonly issues: string,
  ) {
    super(`adapter ${adapter} item ${index}: ${issues}`);
  }
}

/**
 * Stage 1 for `kind: html` and `kind: api` (docs/04 §1): run the source's adapter and check
 * each item against RawItemInput, since adapter code is the part most likely to drift.
 */
export async function fetchWithAdapter(
  source: FetchSource,
  http: HttpClient,
  adapters: ReadonlyMap<string, Adapter> = ADAPTERS,
): Promise<FetchResult> {
  const adapter = source.adapter ? adapters.get(source.adapter) : undefined;
  if (!adapter) throw new AdapterNotFound(source.key, source.adapter);
  const raw: unknown[] = await adapter.fetch(source, http);
  const items = raw.map((item, i) => {
    const parsed = RawItemInput.safeParse(item);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`);
      throw new AdapterOutputInvalid(adapter.key, i, issues.join("; "));
    }
    return parsed.data;
  });
  return { items };
}
