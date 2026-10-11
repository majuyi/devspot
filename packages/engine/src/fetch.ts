import type { RawItemInput, SourceKind } from "@devspot/schema";
import type { HttpClient } from "./http.js";

/** What the fetch stage needs from a source; built from the registry or a Source row. */
export type FetchSource = {
  key: string;
  organizationSlug: string;
  kind: SourceKind;
  url: string;
  adapter?: string;
  include?: string;
};

export type FetchFn = (source: FetchSource, http: HttpClient) => Promise<RawItemInput[]>;

export class FetcherNotImplemented extends Error {
  override readonly name = "FetcherNotImplemented";
  constructor(readonly kind: SourceKind) {
    super(`no fetcher for kind "${kind}" yet (feed M1.3, sitemap M1.4, html and api M1.5)`);
  }
}

/** Stage 1 (docs/04 §1): dispatch on kind. Manual sources produce nothing by design. */
export const fetchSource: FetchFn = async (source) => {
  if (source.kind === "manual") return [];
  throw new FetcherNotImplemented(source.kind);
};
