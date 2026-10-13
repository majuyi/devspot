import { Prisma, type PrismaClient, type RawItem } from "@devspot/db";
import type { RawItemInput } from "@devspot/schema";
import { canonicalizeUrl, contentHash } from "./dedupe.js";

export type FreshItem = { status: "new" | "changed"; rawItem: RawItem };

export type DedupeResult = {
  /** Items in the batch after collapsing ones with the same canonical URL. */
  found: number;
  /** New and changed items, in batch order: the only ones later stages see. */
  fresh: FreshItem[];
  unchanged: number;
};

/**
 * Stage 2 (docs/04 §1): upsert by `(sourceId, canonicalUrl)`. New → create. Same hash →
 * bump `lastSeenAt` and `seenCount`. Different hash → replace title, text, meta and
 * `publishedAt`, bump the same counters, and report it as changed. When two items in one
 * batch share a canonical URL, the first wins. One transaction per batch.
 */
export async function upsertRawItems(
  db: PrismaClient,
  sourceId: string,
  items: readonly RawItemInput[],
  now: Date = new Date(),
): Promise<DedupeResult> {
  const batch = new Map<string, RawItemInput>();
  for (const item of items) {
    const url = canonicalizeUrl(item.url);
    if (!batch.has(url)) batch.set(url, item);
  }
  return db.$transaction(async (tx) => {
    const existing = await tx.rawItem.findMany({
      where: { sourceId, canonicalUrl: { in: [...batch.keys()] } },
    });
    const byUrl = new Map(existing.map((r) => [r.canonicalUrl, r]));
    const fresh: FreshItem[] = [];
    let unchanged = 0;
    for (const [canonicalUrl, item] of batch) {
      const hash = contentHash(item.text);
      const content = {
        title: item.title ?? null,
        text: item.text,
        meta: (item.meta as Prisma.InputJsonValue | undefined) ?? Prisma.DbNull,
        publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
      };
      const prev = byUrl.get(canonicalUrl);
      if (!prev) {
        const rawItem = await tx.rawItem.create({
          data: {
            sourceId,
            canonicalUrl,
            contentHash: hash,
            ...content,
            firstSeenAt: now,
            lastSeenAt: now,
          },
        });
        fresh.push({ status: "new", rawItem });
        continue;
      }
      const seen = { lastSeenAt: now, seenCount: { increment: 1 } };
      if (prev.contentHash === hash) {
        await tx.rawItem.update({ where: { id: prev.id }, data: seen });
        unchanged++;
        continue;
      }
      const rawItem = await tx.rawItem.update({
        where: { id: prev.id },
        data: { ...seen, contentHash: hash, ...content },
      });
      fresh.push({ status: "changed", rawItem });
    }
    return { found: batch.size, fresh, unchanged };
  });
}
