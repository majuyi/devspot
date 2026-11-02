import type { Adapter } from "../adapter.js";
import bamboohr from "./bamboohr.js";
import devpost from "./devpost.js";
import hng from "./hng.js";
import workable from "./workable.js";
import zindi from "./zindi.js";

/** Every adapter, by key. A static map so a typo is a compile error, not a runtime import. */
export const ADAPTERS: ReadonlyMap<string, Adapter> = new Map(
  [bamboohr, devpost, hng, workable, zindi].map((a) => [a.key, a]),
);
