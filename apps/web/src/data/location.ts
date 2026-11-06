import type { Prisma } from "@devspot/db";

/**
 * docs/01 §2: what is available to a reader in a city. Remote items, plus items in Nigeria
 * that are either nationwide (no city) or in that city.
 */
export function availableIn(city: string): Prisma.OpportunityWhereInput {
  return { OR: [{ locationMode: "remote" }, { country: "NG", OR: [{ city: null }, { city }] }] };
}
