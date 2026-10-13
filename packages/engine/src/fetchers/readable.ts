import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { htmlToText, type TextLink } from "./html-text.js";

export type ReadablePage = {
  title?: string;
  text: string;
  links: TextLink[];
  publishedTime?: string;
};

/**
 * The main content of a web page, without menus, footers and sidebars. Readability (Firefox
 * Reader View's engine) picks the content; htmlToText then keeps its paragraphs, lists and
 * links the same way the feed fetcher does. Navigation, footers and asides are removed
 * first; when Readability finds no article, the rest of the body is used rather than nothing.
 */
export function readablePage(html: string, url: string): ReadablePage {
  const { document } = parseHTML(html);
  const pageTitle = document.querySelector("title")?.textContent?.trim() || undefined;
  // Readability keeps site chrome on short pages, so it goes first. A <header> inside an
  // <article> often holds the title and dates, so only page-level headers are removed.
  for (const el of document.querySelectorAll(CHROME)) el.remove();
  const body = document.querySelector("body")?.innerHTML ?? html;
  // Readability mutates the document, so the fallback body is read before it runs.
  const article = new Readability(
    document as unknown as ConstructorParameters<typeof Readability>[0],
  ).parse();
  const { text, links } = htmlToText(article?.content ?? body, url);
  const title = article?.title?.trim() || pageTitle;
  return {
    ...(title ? { title } : {}),
    text,
    links,
    ...(article?.publishedTime ? { publishedTime: article.publishedTime } : {}),
  };
}

const CHROME = "nav, footer, aside, body > header, [role=navigation], [role=contentinfo]";
