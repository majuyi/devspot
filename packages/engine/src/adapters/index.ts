import type { Adapter } from "../adapter.js";
import bamboohr from "./bamboohr.js";
import devpost from "./devpost.js";
import hng from "./hng.js";
import workable from "./workable.js";

/** Every adapter, by key. A static map so a typo is a compile error, not a runtime import. */
export const ADAPTERS: ReadonlyMap<string, Adapter> = new Map(
  [bamboohr, devpost, hng, workable].map((a) => [a.key, a]),
);
