import { ApiError } from "@devspot/schema";
import type { z } from "zod";
import { InvalidCursor } from "../data/cursor";
import { RATE_LIMIT, RateLimiter } from "./rate-limit";

type ErrorCode = z.infer<typeof ApiError>["error"]["code"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
// docs/06 §1. The engine's revalidate call purges these too (M2.12).
const CACHE = "public, s-maxage=900, stale-while-revalidate=3600";
/** Every cached API response carries this tag, so /api/revalidate can mark them all stale. */
export const API_CACHE_TAG = "api-v1";

export const limiter = new RateLimiter();

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "unknown";
}

export function apiError(
  code: ErrorCode,
  message: string,
  status: number,
  headers: Record<string, string> = {},
) {
  return Response.json(ApiError.parse({ error: { code, message } }), {
    status,
    headers: { ...CORS, "Cache-Control": "no-store", ...headers },
  });
}

/** A query string as a plain object, for Zod. Repeated keys keep the last value. */
export function queryOf(req: Request): Record<string, string> {
  return Object.fromEntries(new URL(req.url).searchParams);
}

/** Answers a query-string Zod failure with the first issue, in words a caller can act on. */
function describe(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? `${issue.path.join(".") || "query"}: ${issue.message}` : "invalid query";
}

/**
 * Every public GET: rate limit, CORS, CDN caching, and errors as `{ error: { code, message } }`.
 * The handler returns the body; `null` is a 404.
 */
export async function handle(
  req: Request,
  run: () => Promise<unknown>,
  notFound = "not found",
): Promise<Response> {
  const rate = limiter.take(clientIp(req));
  const rateHeaders = {
    "X-RateLimit-Limit": String(RATE_LIMIT),
    "X-RateLimit-Remaining": String(rate.remaining),
  };
  if (!rate.ok) {
    return apiError("rate_limited", "too many requests", 429, {
      ...rateHeaders,
      "Retry-After": String(rate.retryAfterS),
    });
  }
  try {
    const body = await run();
    if (body === null) return apiError("not_found", notFound, 404, rateHeaders);
    return Response.json(body, {
      headers: {
        ...CORS,
        ...rateHeaders,
        "Cache-Control": CACHE,
        "Vercel-Cache-Tag": API_CACHE_TAG,
      },
    });
  } catch (e) {
    if (e instanceof InvalidCursor) return apiError("bad_request", e.message, 400, rateHeaders);
    if (e instanceof Error && e.name === "ZodError") {
      return apiError("bad_request", describe(e as z.ZodError), 400, rateHeaders);
    }
    console.log(
      JSON.stringify({
        level: "error",
        msg: "api.failed",
        path: new URL(req.url).pathname,
        error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      }),
    );
    return apiError("internal", "something went wrong", 500, rateHeaders);
  }
}

export function options(): Response {
  return new Response(null, {
    status: 204,
    headers: { ...CORS, "Access-Control-Max-Age": "86400" },
  });
}
