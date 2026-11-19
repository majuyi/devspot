import { cookies } from "next/headers";
import { ADMIN_COOKIE, sessionValid } from "./auth";
import { go } from "./go";

export async function isAdmin(): Promise<boolean> {
  return sessionValid((await cookies()).get(ADMIN_COOKIE)?.value);
}

/**
 * For every admin page and action. The proxy already turned signed-out requests away; this
 * is the second lock, so nothing depends on the matcher covering a path.
 */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) go("/admin/login");
}
