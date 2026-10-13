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

/** HTTP cache validators for a conditional GET. The feed fetcher reads and returns them. */
export const Validators = z.object({
  etag: z.string().optional(),
  lastModified: z.string().optional(),
});
export type Validators = z.infer<typeof Validators>;

export const FetchResult = z.object({
  items: z.array(RawItemInput),
  /** 304 means the source is unchanged since `validators` were stored, and `items` is empty. */
  httpStatus: z.number().int().optional(),
  validators: Validators.optional(),
  error: z.string().optional(),
});
export type FetchResult = z.infer<typeof FetchResult>;
