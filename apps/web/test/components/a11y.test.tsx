// @vitest-environment jsdom
import axe from "axe-core";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ComponentsGallery } from "@/components/gallery";

it("the component gallery has no axe violations", async () => {
  document.documentElement.lang = "en-GB";
  document.title = "Components";
  document.body.innerHTML = renderToStaticMarkup(
    <ComponentsGallery now={new Date("2026-11-04T11:00:00Z")} />,
  );
  const result = await axe.run(document, {
    // jsdom does no layout or CSS, so contrast is checked by the token test and Lighthouse instead.
    rules: { "color-contrast": { enabled: false } },
  });
  const violations = result.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`,
  );
  expect(violations).toEqual([]);
});
