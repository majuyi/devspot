import { load } from "cheerio";

export type TextLink = { text: string; href: string };

/** The slice of domhandler's node shape this file reads; domhandler is cheerio's own dep. */
type DomNode = {
  type: string;
  data?: string;
  name?: string;
  attribs?: Record<string, string>;
  children?: DomNode[];
};

const textOf = (node: DomNode): string =>
  node.type === "text" ? (node.data ?? "") : (node.children ?? []).map(textOf).join("");

const DROPPED = "script, style, noscript, template, iframe, svg, img, video, audio, form, button";
/** A link with no text around an image says nothing; one with text is kept wherever it points. */
const IMAGE_PATH = /\.(?:png|jpe?g|gif|webp|avif|svg)$/i;

const BLOCK = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "dd",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tr",
  "ul",
]);

/**
 * HTML to plain text that keeps the structure the rules extractor reads (docs/05 §2): one
 * blank line between blocks, so "first paragraph" and "block under a Requirements heading"
 * still mean something, and list items on their own lines. Links are returned separately
 * for the `applyUrl` rule, resolved against `baseUrl`.
 */
export function htmlToText(html: string, baseUrl?: string): { text: string; links: TextLink[] } {
  const $ = load(html);
  $(DROPPED).remove();
  const lines: string[] = [];
  let line = "";
  const links: TextLink[] = [];
  const seen = new Set<string>();

  const breakLine = (blank: boolean) => {
    const done = line.replace(/[ \t]+/g, " ").trim();
    if (done) lines.push(done);
    if (blank && lines.length && lines[lines.length - 1] !== "") lines.push("");
    line = "";
  };

  const walk = (node: DomNode) => {
    if (node.type === "text") {
      line += (node.data ?? "").replace(/\s+/g, " ");
      return;
    }
    if (node.type !== "tag" || !node.name) return;
    const tag = node.name.toLowerCase();
    if (tag === "br") return breakLine(false);
    const block = BLOCK.has(tag);
    if (block) breakLine(tag !== "li" && tag !== "tr" && tag !== "dd" && tag !== "dt");
    if (tag === "li") line += "- ";
    if (tag === "td" || tag === "th") line += " ";
    for (const child of node.children ?? []) walk(child);
    if (tag === "a") {
      const href = resolveHref(node.attribs?.href, baseUrl);
      const text = textOf(node).replace(/\s+/g, " ").trim();
      const imageOnly =
        text === "" && href !== undefined && IMAGE_PATH.test(new URL(href).pathname);
      if (href && !imageOnly && !seen.has(`${text}\u0000${href}`)) {
        seen.add(`${text}\u0000${href}`);
        links.push({ text, href });
      }
    }
    if (block) breakLine(tag !== "li" && tag !== "tr" && tag !== "dd" && tag !== "dt");
  };

  for (const node of ($.root()[0]?.children ?? []) as DomNode[]) walk(node);
  breakLine(false);
  while (lines[lines.length - 1] === "") lines.pop();
  return { text: lines.join("\n"), links };
}

function resolveHref(href: string | undefined, baseUrl: string | undefined): string | undefined {
  if (!href || href.startsWith("#") || href.startsWith("javascript:")) return undefined;
  try {
    const url = new URL(href, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
