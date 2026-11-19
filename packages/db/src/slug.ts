import { createHash } from "node:crypto";
import type { PrismaClient } from "./generated/prisma/client";

/**
 * A free opportunity slug. A collision takes a 4-character suffix drawn from the URL, so
 * reruns pick the same one. Shared by the engine's loader and /admin/new.
 */
export async function uniqueSlug(
  db: Pick<PrismaClient, "opportunity">,
  base: string,
  canonicalUrl: string,
): Promise<string> {
  for (let n = 0; ; n++) {
    const suffix = createHash("sha256").update(`${canonicalUrl}#${n}`).digest("hex").slice(0, 4);
    const slug = n === 0 ? base : `${base}-${suffix}`;
    const taken = await db.opportunity.findUnique({ where: { slug }, select: { id: true } });
    if (!taken) return slug;
  }
}
