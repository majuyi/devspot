import { z } from "zod";

/** What a fetcher or adapter returns for one listed item. No structure beyond this. */
export const RawItemInput = z.object({
  url: z.url(),
  title: z.string().max(300).optional(),
  text: z.string().min(1),
  publishedAt: z.iso.datetime().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type RawItemInput = z.infer<typeof RawItemInput>;

export const FetchResult = z.object({
  items: z.array(RawItemInput),
  httpStatus: z.number().int().optional(),
  error: z.string().optional(),
});
export type FetchResult = z.infer<typeof FetchResult>;
