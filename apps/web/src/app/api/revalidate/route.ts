import { createHash, timingSafeEqual } from "node:crypto";
import { invalidateByTag } from "@vercel/functions";
import { revalidatePath } from "next/cache";
import { API_CACHE_TAG } from "@/api/http";

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Constant-time, and the same length for any input, so the secret's length does not leak. */
function matches(given: string | null, secret: string | undefined): boolean {
  if (!given || !secret) return false;
  return timingSafeEqual(digest(given), digest(secret));
}

/**
 * Called by engine.yml after each run (docs/02 §6): refreshes every ISR page now rather than
 * within 15 minutes, and marks the CDN's cached /api/v1 responses stale. Internal, not part of
 * the API contract.
 */
export async function POST(req: Request) {
  if (!matches(req.headers.get("x-revalidate-secret"), process.env.REVALIDATE_SECRET)) {
    return Response.json(
      { error: { code: "unauthorized", message: "missing or wrong x-revalidate-secret" } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  revalidatePath("/", "layout");
  // A no-op outside Vercel.
  await invalidateByTag(API_CACHE_TAG);
  const at = new Date().toISOString();
  console.log(JSON.stringify({ level: "info", msg: "revalidated", at }));
  return Response.json({ revalidated: true, at }, { headers: { "Cache-Control": "no-store" } });
}
