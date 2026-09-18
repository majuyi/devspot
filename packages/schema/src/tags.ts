import { z } from "zod";

// Allowlist. Free strings from extraction are normalized against this list; unknown tags are dropped.
export const TAGS = [
  "backend",
  "frontend",
  "mobile",
  "data",
  "ml",
  "design",
  "product",
  "devops",
  "security",
  "web3",
  "women-in-tech",
  "students-only",
  "final-year",
  "stipend",
  "fully-funded",
  "free",
] as const;

export const Tag = z.enum(TAGS);
export type Tag = z.infer<typeof Tag>;

export function normalizeTags(input: readonly string[]): Tag[] {
  const set = new Set<Tag>();
  for (const raw of input) {
    const t = raw.trim().toLowerCase().replace(/\s+/g, "-");
    if ((TAGS as readonly string[]).includes(t)) set.add(t as Tag);
  }
  return [...set];
}
