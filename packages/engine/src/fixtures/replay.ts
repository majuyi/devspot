import { type Dispatcher, MockAgent } from "undici";
import type { FetchFn, FetchSource } from "../fetch.js";
import { HttpClient } from "../http.js";
import { unifiedDiff } from "./diff.js";
import {
  type ExpectedFixture,
  exchangeKey,
  FIXTURES_DIR,
  fixtureDir,
  type HttpFixture,
  readExpected,
  readHttpFixture,
  writeExpected,
} from "./fixture.js";

/** A request with no recorded response. In tests this is a failure, never a fallback. */
export class UnexpectedNetworkAccess extends Error {
  override readonly name = "UnexpectedNetworkAccess";
  constructor(readonly key: string) {
    super(`no recorded response for ${key}; tests never reach the network`);
  }
}

function requestKey(options: Dispatcher.DispatchOptions): string {
  const url = new URL(options.path, options.origin ?? undefined).href;
  return exchangeKey(options.method ?? "GET", url);
}

/**
 * Serves a fixture's exchanges. Repeated requests for one key get the recorded responses in
 * order, and the last one after that, so a recorded retry sequence replays the same way.
 */
export class ReplayDispatcher extends MockAgent {
  private readonly keys = new Set<string>();

  constructor(fixture: HttpFixture) {
    super();
    this.disableNetConnect();
    const byKey = new Map<string, HttpFixture["exchanges"]>();
    for (const e of fixture.exchanges) {
      const key = exchangeKey(e.method, e.url);
      byKey.set(key, [...(byKey.get(key) ?? []), e]);
    }
    for (const [key, exchanges] of byKey) {
      this.keys.add(key);
      exchanges.forEach((e, i) => {
        const url = new URL(e.url);
        const scope = this.get(url.origin)
          .intercept({ path: url.pathname + url.search, method: e.method })
          .reply(e.status, e.body, { headers: e.headers });
        if (i === exchanges.length - 1) scope.persist();
      });
    }
  }

  override dispatch(
    options: Dispatcher.DispatchOptions,
    handler: Dispatcher.DispatchHandler,
  ): boolean {
    const key = requestKey(options);
    if (!this.keys.has(key)) throw new UnexpectedNetworkAccess(key);
    return super.dispatch(options, handler);
  }
}

/** Installed as undici's global dispatcher in tests, so even a stray fetch() fails loudly. */
export class NoNetworkDispatcher extends MockAgent {
  constructor() {
    super();
    this.disableNetConnect();
  }

  override dispatch(options: Dispatcher.DispatchOptions): boolean {
    throw new UnexpectedNetworkAccess(requestKey(options));
  }
}

export type ReplayResult = { equal: boolean; diff: string; actual: ExpectedFixture };

/** Runs the fetcher against the fixture and compares with `expected.json`. */
export async function replaySource(options: {
  source: FetchSource;
  fetch: FetchFn;
  root?: string;
}): Promise<ReplayResult> {
  const dir = fixtureDir(options.source.key, options.root ?? FIXTURES_DIR);
  const dispatcher = new ReplayDispatcher(readHttpFixture(dir));
  // Replay is instant: no rate limit and no backoff waits, the responses are already here.
  const http = new HttpClient({ dispatcher, minIntervalMs: 0, sleep: async () => {} });
  try {
    const { items } = await options.fetch(options.source, http);
    const actual: ExpectedFixture = { sourceKey: options.source.key, items };
    const want = `${JSON.stringify(readExpected(dir), null, 2)}\n`;
    const got = `${JSON.stringify(actual, null, 2)}\n`;
    return { equal: want === got, diff: unifiedDiff(want, got), actual };
  } finally {
    await dispatcher.close();
  }
}

export function acceptReplay(
  source: FetchSource,
  actual: ExpectedFixture,
  root = FIXTURES_DIR,
): void {
  writeExpected(fixtureDir(source.key, root), actual);
}
