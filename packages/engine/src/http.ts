import robotsParser from "robots-parser";
import { type Dispatcher, getGlobalDispatcher, request } from "undici";
import { UnexpectedNetworkAccess } from "./fixtures/replay.js";

/**
 * The contact URL is the repository until the public site exists (M2.12); see docs/04 §1.
 */
export const USER_AGENT = "devspot-bot/0.1 (+https://github.com/majuyi/devspot)";
/** The product token robots.txt groups are matched against. */
const ROBOTS_AGENT = "devspot-bot";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export class RobotsDisallowed extends Error {
  override readonly name = "RobotsDisallowed";
  constructor(readonly url: string) {
    super(`robots.txt disallows ${url}`);
  }
}

export class HttpStatusError extends Error {
  override readonly name = "HttpStatusError";
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}

/** Network error or timeout that outlasted every retry. */
export class HttpRequestFailed extends Error {
  override readonly name = "HttpRequestFailed";
  constructor(
    readonly url: string,
    readonly attempts: number,
    cause: unknown,
  ) {
    super(`request to ${url} failed after ${attempts} attempts`, { cause });
  }
}

export class TooManyRedirects extends Error {
  override readonly name = "TooManyRedirects";
  constructor(readonly url: string) {
    super(`too many redirects from ${url}`);
  }
}

export type HttpResponse = {
  /** Final URL after redirects. */
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
};

export type HttpClientOptions = {
  dispatcher?: Dispatcher;
  userAgent?: string;
  /** Minimum gap between requests to one host. A longer robots.txt Crawl-delay wins. */
  minIntervalMs?: number;
  timeoutMs?: number;
  retries?: number;
  robotsTtlMs?: number;
  maxRedirects?: number;
  /** Injected so tests control time and jitter. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** Called with every response, robots.txt included. The fixture recorder listens here. */
  onExchange?: (exchange: HttpExchange) => void;
};

export type HttpExchange = HttpResponse & { method: "GET" };

type RobotsRules = { fetchedAt: number; allows: (url: string) => boolean; crawlDelayMs: number };

/**
 * The engine's only way onto the network. Fetchers and adapters receive one and never call
 * fetch or undici themselves, so rate limits, robots.txt and record/replay apply everywhere.
 */
export class HttpClient {
  private readonly dispatcher: Dispatcher;
  private readonly userAgent: string;
  private readonly minIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly robotsTtlMs: number;
  private readonly maxRedirects: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly onExchange: ((exchange: HttpExchange) => void) | undefined;
  /** Per origin: the earliest time the next request may start. */
  private readonly nextSlot = new Map<string, number>();
  private readonly robots = new Map<string, RobotsRules>();

  constructor(options: HttpClientOptions = {}) {
    this.dispatcher = options.dispatcher ?? getGlobalDispatcher();
    this.userAgent = options.userAgent ?? USER_AGENT;
    this.minIntervalMs = options.minIntervalMs ?? 1000;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.retries = options.retries ?? 3;
    this.robotsTtlMs = options.robotsTtlMs ?? 24 * 60 * 60 * 1000;
    this.maxRedirects = options.maxRedirects ?? 5;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.random = options.random ?? Math.random;
    this.onExchange = options.onExchange;
  }

  /**
   * GET with robots.txt checked on every hop. Returns any status, including 304 and 4xx, so
   * callers that send conditional headers can read them; `text` and `json` throw instead.
   */
  async get(url: string, headers: Record<string, string> = {}): Promise<HttpResponse> {
    let current = url;
    for (let hop = 0; hop <= this.maxRedirects; hop++) {
      await this.assertAllowed(current);
      const res = await this.fetchWithRetry(current, headers);
      const location = res.headers.location;
      if (!REDIRECT_STATUSES.has(res.status) || !location) return res;
      current = new URL(location, current).href;
    }
    throw new TooManyRedirects(url);
  }

  async text(url: string, headers: Record<string, string> = {}): Promise<string> {
    const res = await this.get(url, headers);
    if (res.status < 200 || res.status >= 300) throw new HttpStatusError(res.url, res.status);
    return res.body;
  }

  async json(url: string, headers: Record<string, string> = {}): Promise<unknown> {
    return JSON.parse(await this.text(url, { accept: "application/json", ...headers }));
  }

  private async assertAllowed(url: string): Promise<void> {
    const rules = await this.rulesFor(new URL(url).origin);
    if (!rules.allows(url)) throw new RobotsDisallowed(url);
  }

  private async rulesFor(origin: string): Promise<RobotsRules> {
    const cached = this.robots.get(origin);
    if (cached && this.now() - cached.fetchedAt < this.robotsTtlMs) return cached;
    const rules = await this.loadRobots(origin);
    this.robots.set(origin, rules);
    return rules;
  }

  /** RFC 9309 §2.3.1: 4xx means no rules; 5xx or unreachable means disallow everything. */
  private async loadRobots(origin: string): Promise<RobotsRules> {
    const fetchedAt = this.now();
    const robotsUrl = `${origin}/robots.txt`;
    let res: HttpResponse;
    try {
      res = await this.fetchWithRetry(robotsUrl, {});
      for (let hop = 0; REDIRECT_STATUSES.has(res.status) && res.headers.location; hop++) {
        if (hop >= this.maxRedirects) throw new TooManyRedirects(robotsUrl);
        res = await this.fetchWithRetry(new URL(res.headers.location, res.url).href, {});
      }
    } catch (error) {
      if (error instanceof UnexpectedNetworkAccess) throw error;
      return { fetchedAt, allows: () => false, crawlDelayMs: 0 };
    }
    if (res.status >= 400 && res.status < 500)
      return { fetchedAt, allows: () => true, crawlDelayMs: 0 };
    if (res.status >= 500) return { fetchedAt, allows: () => false, crawlDelayMs: 0 };
    const parsed = robotsParser(robotsUrl, res.body);
    return {
      fetchedAt,
      allows: (url) => parsed.isAllowed(url, ROBOTS_AGENT) ?? true,
      crawlDelayMs: (parsed.getCrawlDelay(ROBOTS_AGENT) ?? 0) * 1000,
    };
  }

  /** Retries 5xx and network errors with exponential backoff and jitter; never 4xx. */
  private async fetchWithRetry(
    url: string,
    headers: Record<string, string>,
  ): Promise<HttpResponse> {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await this.fetchOnce(url, headers);
        if (res.status < 500 || attempt >= this.retries) return res;
      } catch (error) {
        // A replay miss is a missing fixture, not a flaky network: fail at once.
        if (error instanceof UnexpectedNetworkAccess) throw error;
        if (attempt >= this.retries) throw new HttpRequestFailed(url, attempt + 1, error);
      }
      await this.sleep(500 * 2 ** attempt * (0.5 + this.random()));
    }
  }

  private async fetchOnce(url: string, headers: Record<string, string>): Promise<HttpResponse> {
    await this.waitForSlot(new URL(url).origin);
    const res = await request(url, {
      dispatcher: this.dispatcher,
      method: "GET",
      headers: { "user-agent": this.userAgent, ...headers },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const body = await res.body.text();
    const flat: Record<string, string> = {};
    for (const [name, value] of Object.entries(res.headers)) {
      if (value !== undefined) flat[name] = Array.isArray(value) ? value.join(", ") : value;
    }
    const response = { url, status: res.statusCode, headers: flat, body };
    this.onExchange?.({ method: "GET", ...response });
    return response;
  }

  /** Reserves the slot before waiting, so concurrent callers queue instead of colliding. */
  private async waitForSlot(origin: string): Promise<void> {
    const interval = Math.max(this.minIntervalMs, this.robots.get(origin)?.crawlDelayMs ?? 0);
    const now = this.now();
    const slot = Math.max(now, this.nextSlot.get(origin) ?? 0);
    this.nextSlot.set(origin, slot + interval);
    if (slot > now) await this.sleep(slot - now);
  }
}
