import { RawItemInput } from "@devspot/schema";
import type { Dispatcher } from "undici";
import { z } from "zod";
import type { FetchFn, FetchSource } from "../fetch.js";
import { HttpClient, type HttpClientOptions, type HttpExchange } from "../http.js";
import { type Exchange, FIXTURES_DIR, fixtureDir, writeFixture } from "./fixture.js";

/** Bodies over this should be trimmed in the adapter before recording (docs/04 §3). */
export const BODY_LIMIT_BYTES = 300 * 1024;

const DROPPED_HEADERS = new Set(["set-cookie", "cookie", "authorization", "proxy-authorization"]);

/** Shapes of secrets that must never land in a committed fixture. */
export const CREDENTIAL_PATTERNS: readonly RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/i,
  /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|secret[_-]?key|password)["']?\s*[:=]\s*["']?[A-Za-z0-9._~+/-]{8,}/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
  /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}/,
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
];

/** A response body matched a credential pattern; nothing was written. */
export class FixtureContainsCredential extends Error {
  override readonly name = "FixtureContainsCredential";
  constructor(
    readonly sourceKey: string,
    readonly url: string,
    readonly offset: number,
    readonly excerpt: string,
  ) {
    super(
      `refusing to record ${sourceKey}: the body of ${url} matches a credential pattern at ` +
        `character ${offset}: "${excerpt}"`,
    );
  }
}

function findCredential(text: string): RegExpExecArray | null {
  for (const pattern of CREDENTIAL_PATTERNS) {
    const match = pattern.exec(text);
    if (match) return match;
  }
  return null;
}

/**
 * Headers are scrubbed in place: cookie and auth headers dropped, credential-shaped values
 * replaced. A body cannot be scrubbed without changing what the fetcher parses, so a match
 * there refuses the whole recording.
 */
export function scrubExchange(sourceKey: string, exchange: HttpExchange): Exchange {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(exchange.headers)) {
    if (DROPPED_HEADERS.has(name.toLowerCase())) continue;
    headers[name] = findCredential(value) ? "[scrubbed]" : value;
  }
  const match = findCredential(exchange.body);
  if (match) {
    const excerpt = match[0].length > 24 ? `${match[0].slice(0, 24)}…` : match[0];
    throw new FixtureContainsCredential(sourceKey, exchange.url, match.index, excerpt);
  }
  return { ...exchange, headers };
}

export type RecordResult = {
  dir: string;
  exchanges: number;
  items: number;
  /** URLs whose body is over BODY_LIMIT_BYTES. Written anyway; trim in the adapter. */
  oversized: string[];
};

/** Fetches a source live, then writes its fixture. Validates and scrubs before writing. */
export async function recordSource(options: {
  source: FetchSource;
  fetch: FetchFn;
  dispatcher?: Dispatcher;
  root?: string;
  /** Tests pass a fast clock; the CLI uses the real limits. */
  httpOptions?: HttpClientOptions;
  now?: () => Date;
}): Promise<RecordResult> {
  const seen: HttpExchange[] = [];
  const http = new HttpClient({
    ...options.httpOptions,
    ...(options.dispatcher ? { dispatcher: options.dispatcher } : {}),
    onExchange: (e) => seen.push(e),
  });
  const items = z.array(RawItemInput).parse((await options.fetch(options.source, http)).items);
  const exchanges = seen.map((e) => scrubExchange(options.source.key, e));
  const dir = fixtureDir(options.source.key, options.root ?? FIXTURES_DIR);
  writeFixture(
    dir,
    {
      version: 1,
      sourceKey: options.source.key,
      recordedAt: (options.now?.() ?? new Date()).toISOString(),
      exchanges,
    },
    { sourceKey: options.source.key, items },
  );
  const oversized = exchanges
    .filter((e) => Buffer.byteLength(e.body, "utf8") > BODY_LIMIT_BYTES)
    .map((e) => e.url);
  return { dir, exchanges: exchanges.length, items: items.length, oversized };
}
