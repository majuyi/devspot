import type { Adapter } from "../adapter.js";
import bamboohr from "./bamboohr.js";
import bevy from "./bevy.js";
import devpost from "./devpost.js";
import hng from "./hng.js";
import mlh from "./mlh.js";
import workable from "./workable.js";
import zindi from "./zindi.js";

/** Every adapter, by key. A static map so a typo is a compile error, not a runtime import. */
export const ADAPTERS: ReadonlyMap<string, Adapter> = new Map(
  [bamboohr, bevy, devpost, hng, mlh, workable, zindi].map((a) => [a.key, a]),
);
