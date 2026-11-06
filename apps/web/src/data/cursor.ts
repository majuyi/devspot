import { z } from "zod";

/** A cursor that did not decode. The API answers it with `bad_request`. */
export class InvalidCursor extends Error {
  override readonly name = "InvalidCursor";
  constructor() {
    super("cursor is not valid");
  }
}

/** docs/06 §1: opaque base64url of the last row's sort key and id. */
export function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeCursor<T>(cursor: string | undefined, shape: z.ZodType<T>): T | undefined {
  if (cursor === undefined || cursor === "") return undefined;
  try {
    const parsed = shape.safeParse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    if (parsed.success) return parsed.data;
  } catch {}
  throw new InvalidCursor();
}

/** The key of a keyset cursor: the sort column as ISO (or null) plus the id that breaks ties. */
export const KeyCursor = z.object({ k: z.iso.datetime().nullable(), id: z.string().min(1) });
export type KeyCursor = z.infer<typeof KeyCursor>;
