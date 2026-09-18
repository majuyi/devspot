import { z } from "zod";
import { CitySlug } from "./cities.js";
import { OpportunityKind } from "./enums.js";

export const Preferences = z.object({
  v: z.literal(1),
  kinds: z.array(OpportunityKind).default([]),
  city: CitySlug.optional(),
  tags: z.array(z.string()).default([]),
  remoteOnly: z.boolean().optional(),
});
export type Preferences = z.infer<typeof Preferences>;

export const PREFS_COOKIE = "prefs";

export function encodePreferences(p: Preferences): string {
  return `v1.${Buffer.from(JSON.stringify(p), "utf8").toString("base64url")}`;
}

export function decodePreferences(value: string | undefined): Preferences | undefined {
  if (!value?.startsWith("v1.")) return undefined;
  try {
    const parsed = Preferences.safeParse(
      JSON.parse(Buffer.from(value.slice(3), "base64url").toString("utf8")),
    );
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
