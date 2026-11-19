import { type NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, guard } from "@/admin/auth";

/**
 * The admin guard (docs/02 §7): every `/admin/*` page and `/api/admin/*` route needs the
 * signed session cookie. Runs before the route, so a page or action that forgot its own
 * check is still closed; each action checks again all the same.
 */
export function proxy(request: NextRequest) {
  const decision = guard(request.nextUrl.pathname, request.cookies.get(ADMIN_COOKIE)?.value);
  if (decision === "unauthorized") {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "sign in at /admin/login" } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (decision === "login") {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  const response = NextResponse.next();
  // Nothing under admin belongs in a search index or a shared cache.
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };
