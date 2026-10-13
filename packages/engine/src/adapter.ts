import type { RawItemInput } from "@devspot/schema";
import type { FetchSource } from "./fetch.js";
import type { HttpClient } from "./http.js";

/**
 * One organization's scraper for an `html` or `api` source (docs/04 §1 "Adapter contract").
 * Return every currently listed item; no date filtering, no structure beyond RawItemInput,
 * no database, no LLM. `key` matches `Source.adapter` in the registry.
 */
export type Adapter = {
  key: string;
  fetch(source: FetchSource, http: HttpClient): Promise<RawItemInput[]>;
};

/** The page or API no longer has the shape the adapter reads; fix the adapter (add-adapter). */
export class AdapterLayoutChanged extends Error {
  override readonly name = "AdapterLayoutChanged";
  constructor(
    readonly adapter: string,
    readonly url: string,
    readonly detail: string,
  ) {
    super(`adapter ${adapter} cannot read ${url}: ${detail}`);
  }
}
