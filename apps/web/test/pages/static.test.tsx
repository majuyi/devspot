// @vitest-environment jsdom
import axe from "axe-core";
import { describe, expect, it } from "vitest";
import About from "../../src/app/about/page";
import Contribute from "../../src/app/contribute/page";
import { SiteFooter } from "../../src/components/site-footer";
import { render, text } from "../components/render";

async function violations(el: HTMLElement, title: string): Promise<string[]> {
  document.documentElement.lang = "en-GB";
  document.title = title;
  document.body.replaceChildren(el);
  const result = await axe.run(document, { rules: { "color-contrast": { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);
}
const hrefs = (el: Element) => [...el.querySelectorAll("a")].map((a) => a.getAttribute("href"));

describe("static pages (docs/01 §3)", () => {
  it("/about says where listings come from and what it never does, and never says who qualifies", async () => {
    const el = render(About());
    expect(text(el.querySelector("h1") as Element)).toBe("About");
    expect(text(el)).toContain("We do not decide who can apply.");
    expect(text(el)).toContain("We never guess a date.");
    expect(text(el)).not.toMatch(/eligib|you qualify|perfect for you/i);
    expect(hrefs(el)).toEqual(
      expect.arrayContaining([
        "/status",
        "/contribute",
        "/api/v1/openapi.json",
        "/calendar#subscribe",
      ]),
    );
    expect(await violations(el, "About")).toEqual([]);
  });

  it("/contribute points at the registry template, issues, status and CONTRIBUTING.md", async () => {
    const el = render(Contribute());
    expect(text(el.querySelector("h1") as Element)).toBe("Contribute");
    expect(hrefs(el)).toEqual(
      expect.arrayContaining([
        "https://github.com/majuyi/devspot/blob/main/registry/organizations/_template.yaml",
        "https://github.com/majuyi/devspot/issues/new",
        "/status",
        "https://github.com/majuyi/devspot/blob/main/CONTRIBUTING.md",
      ]),
    );
    expect(await violations(el, "Contribute")).toEqual([]);
  });

  it("the footer links only to pages that exist: API is the OpenAPI document until M4.5", () => {
    const links = hrefs(render(SiteFooter()));
    expect(links).toContain("/about");
    expect(links).toContain("/api/v1/openapi.json");
    expect(links).not.toContain("/api");
  });
});
