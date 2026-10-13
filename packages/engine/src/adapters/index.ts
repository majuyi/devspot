import type { Adapter } from "../adapter.js";
import devpost from "./devpost.js";
import hng from "./hng.js";

/** Every adapter, by key. A static map so a typo is a compile error, not a runtime import. */
export const ADAPTERS: ReadonlyMap<string, Adapter> = new Map(
  [devpost, hng].map((a) => [a.key, a]),
);
