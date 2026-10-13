import type { FetchResult, SourceKind, Validators } from "@devspot/schema";
import { fetchFeed } from "./fetchers/feed.js";
import { fetchWithAdapter } from "./fetchers/html.js";
import { fetchSitemap } from "./fetchers/sitemap.js";
import type { HttpClient } from "./http.js";

/** What the fetch stage needs from a source; built from the registry or a Source row. */
export type FetchSource = {
  key: string;
  organizationSlug: string;
  kind: SourceKind;
  url: string;
  adapter?: string;
  include?: string;
  /** From the last successful run, for a conditional GET. Absent on the first run. */
  validators?: Validators;
  /**
   * The source's `RawItem.canonicalUrl`s, loaded by the caller. Sources that spend a request
   * per item (sitemap, the devpost adapter) skip these and fetch only new ones.
   */
  knownUrls?: ReadonlySet<string>;
};

export type FetchFn = (source: FetchSource, http: HttpClient) => Promise<FetchResult>;

/** Stage 1 (docs/04 §1): dispatch on kind. Manual sources produce nothing by design. */
export const fetchSource: FetchFn = async (source, http) => {
  switch (source.kind) {
    case "manual":
      return { items: [] };
    case "feed":
      return fetchFeed(source, http);
    case "sitemap":
      return fetchSitemap(source, http);
    case "html":
    case "api":
      return fetchWithAdapter(source, http);
  }
};
