// @vitest-environment jsdom
// biome-ignore-all lint/suspicious/noDocumentCookie: jsdom has no Cookie Store API to set a cookie with
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { CityPill } from "@/components/city-pill";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NAMES = { lagos: "Lagos", "port-harcourt": "Port Harcourt" };
const pill = <CityPill names={NAMES} before={null} after={null} />;

function clearCookies() {
  for (const c of document.cookie.split(";")) {
    const name = c.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
}

async function mounted(): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.append(host);
  await act(async () => {
    createRoot(host).render(pill);
  });
  return host;
}

describe("the header's city pill", () => {
  afterEach(clearCookies);

  it("says Choose city in the HTML every reader is sent, and links to the feed's form", () => {
    const html = renderToStaticMarkup(pill);
    expect(html).toContain("Choose city");
    expect(html).toContain('href="/feed?edit=1"');
  });

  it("names the saved city once loaded, from the plain city cookie", async () => {
    document.cookie = "other=1; Path=/";
    document.cookie = "city=port-harcourt; Path=/";
    const el = await mounted();
    expect(el.textContent).toBe("Port Harcourt, change city");
  });

  it("stays as Choose city with no cookie or one it does not know", async () => {
    expect((await mounted()).textContent).toBe("Choose city");
    document.cookie = "city=atlantis; Path=/";
    expect((await mounted()).textContent).toBe("Choose city");
  });
});
