import type { Route } from "next";
import { redirect } from "next/navigation";

/**
 * `redirect` for admin paths built at run time (a queue URL carried through a form). The
 * paths are checked by `safeBack` or written here, which the route types cannot see.
 */
export function go(path: string): never {
  redirect(path as Route);
}
