import { encodePreferences, PREFS_COOKIE } from "@devspot/schema";
import { CITY_COOKIE, prefsFromForm, safeNext } from "@/ui/prefs";

const YEAR = 365 * 24 * 60 * 60;

function cookie(name: string, value: string, maxAge: number, opts: { httpOnly: boolean }): string {
  return [
    `${name}=${value}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "SameSite=Lax",
    ...(opts.httpOnly ? ["HttpOnly"] : []),
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
  ].join("; ");
}

/**
 * A post from another site is refused: it could not read anything, but it could quietly
 * change what a reader sees. Browsers send Origin with a form post; a client that sends
 * none (curl, a test) is not a browser being tricked.
 */
function fromElsewhere(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

/**
 * Saves the feed's preferences in a cookie and sends the reader back (docs/01 §2). A plain
 * form post, so it works without JavaScript. No account and nothing stored on the server.
 * `clear=1` removes the cookies. A form with nothing chosen is a feed of everything.
 */
export async function POST(req: Request) {
  if (fromElsewhere(req)) {
    return new Response("This form can only be sent from this site.\n", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response("Expected a form.\n", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  const prefs = prefsFromForm(form);
  const clear = form.get("clear") === "1";
  const headers = new Headers({
    // 303: the browser follows with a GET, so a reload never re-posts the form.
    Location: new URL(safeNext(form.get("next")), req.url).toString(),
    "Cache-Control": "no-store",
  });
  headers.append(
    "Set-Cookie",
    clear
      ? cookie(PREFS_COOKIE, "", 0, { httpOnly: true })
      : cookie(PREFS_COOKIE, encodePreferences(prefs), YEAR, { httpOnly: true }),
  );
  // Readable by the page: the header names the city from it. It holds nothing private.
  headers.append(
    "Set-Cookie",
    !clear && prefs.city
      ? cookie(CITY_COOKIE, prefs.city, YEAR, { httpOnly: false })
      : cookie(CITY_COOKIE, "", 0, { httpOnly: false }),
  );
  return new Response(null, { status: 303, headers });
}
