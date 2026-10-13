import { describe, expect, it } from "vitest";
import { htmlToText } from "../src/fetchers/html-text.js";

describe("htmlToText", () => {
  it("separates blocks with a blank line and keeps headings on their own line", () => {
    const { text } = htmlToText(
      "<h2>About</h2><p>A paid  <b>internship</b>\n in Lagos.</p><h3>Requirements</h3><p>Final-year students.</p>",
    );
    expect(text).toBe(
      "About\n\nA paid internship in Lagos.\n\nRequirements\n\nFinal-year students.",
    );
  });

  it("puts list items on their own lines and honours <br>", () => {
    const { text } = htmlToText(
      "<p>Dates:<br>Opens 1 May<br/>Closes 31 May</p><ul><li>One</li><li>Two</li></ul>",
    );
    expect(text).toBe("Dates:\nOpens 1 May\nCloses 31 May\n\n- One\n- Two");
  });

  it("drops scripts, styles and images, and decodes entities", () => {
    const { text } = htmlToText(
      '<style>p{}</style><p>Tom &amp; Jerry&#8217;s <img src="x.png">fund</p><script>alert(1)</script>',
    );
    expect(text).toBe("Tom & Jerry’s fund");
  });

  it("returns links resolved against the base URL, once each", () => {
    const { links } = htmlToText(
      '<p><a href="/apply">Apply here</a> or <a href="/apply">Apply here</a>, <a href="#top">top</a>, <a href="mailto:a@b.org">email</a></p>',
      "https://example.org/post/1",
    );
    expect(links).toEqual([
      { text: "Apply here", href: "https://example.org/apply" },
      { text: "email", href: "mailto:a@b.org" },
    ]);
  });

  it("drops a link that only wraps an image, keeps a textless link to a page", () => {
    const { links } = htmlToText(
      '<a href="https://cdn.example/banner.png"><img src="b.png"></a><a href="https://forms.example/x"><img src="c.png"></a>',
    );
    expect(links).toEqual([{ text: "", href: "https://forms.example/x" }]);
  });

  it("ignores javascript: links and unparseable hrefs", () => {
    const { links } = htmlToText('<a href="javascript:void(0)">x</a><a href="http://[bad">y</a>');
    expect(links).toEqual([]);
  });
});
