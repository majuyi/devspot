import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/** Server-render a component to a detached element, the way a reader without JS receives it. */
export function render(node: ReactElement): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(node);
  return host;
}

export const text = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();
