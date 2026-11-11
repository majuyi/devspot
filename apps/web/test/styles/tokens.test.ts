import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COLOR_GROUPS, TEXT_PAIRS, THEME_INVARIANT } from "@/styles/tokens";

const css = readFileSync(new URL("../../src/styles/tokens.css", import.meta.url), "utf8");
const darkStart = css.indexOf("@media (prefers-color-scheme: dark)");

function tokens(block: string): Map<string, string> {
  return new Map(
    [...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [
      m[1] as string,
      m[2] as string,
    ]),
  );
}

const light = tokens(css.slice(0, darkStart));
const dark = new Map([...light, ...tokens(css.slice(darkStart))]);
const names: string[] = Object.values(COLOR_GROUPS).flat();

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe("tokens.css", () => {
  it("defines exactly the docs/07 tokens in light", () => {
    expect([...light.keys()].sort()).toEqual([...names].sort());
  });

  it("overrides every token in dark except the theme-invariant ones", () => {
    const overridden = [...tokens(css.slice(darkStart)).keys()].sort();
    expect(overridden).toEqual(
      names.filter((n) => !(THEME_INVARIANT as readonly string[]).includes(n)).sort(),
    );
  });

  for (const [theme, values] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    it.each(TEXT_PAIRS)(`${theme}: %s on %s passes AA`, (text, ground) => {
      expect(
        contrast(values.get(text) as string, values.get(ground) as string),
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
});
