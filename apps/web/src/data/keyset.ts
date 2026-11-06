import type { Prisma } from "@devspot/db";
import type { KeyCursor } from "./cursor";

type DateField = "deadlineAt" | "publishedAt" | "updatedAt" | "startsAt";

export type Keyset = { field: DateField; dir: "asc" | "desc"; nullable: boolean };

/** Order by the key, nulls last, then by id in the same direction so ties are stable. */
export function keysetOrder(ks: Keyset): Prisma.OpportunityOrderByWithRelationInput[] {
  return [
    ks.nullable ? { [ks.field]: { sort: ks.dir, nulls: "last" } } : { [ks.field]: ks.dir },
    { id: ks.dir },
  ];
}

/** Rows strictly after the cursor in `keysetOrder`. */
export function keysetAfter(ks: Keyset, c: KeyCursor | undefined): Prisma.OpportunityWhereInput {
  if (!c) return {};
  const beyond = ks.dir === "asc" ? "gt" : "lt";
  if (c.k === null) return { [ks.field]: null, id: { [beyond]: c.id } };
  const k = new Date(c.k);
  return {
    OR: [
      { [ks.field]: { [beyond]: k } },
      { [ks.field]: k, id: { [beyond]: c.id } },
      ...(ks.nullable ? [{ [ks.field]: null }] : []),
    ],
  };
}

export function keyOf(ks: Keyset, row: Record<DateField, Date | null> & { id: string }): KeyCursor {
  return { k: row[ks.field]?.toISOString() ?? null, id: row.id };
}
