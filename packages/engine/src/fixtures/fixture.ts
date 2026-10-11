import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { RawItemInput } from "@devspot/schema";
import { z } from "zod";

export const FIXTURES_DIR = resolve(import.meta.dirname, "../../test/fixtures");

const Exchange = z.object({
  method: z.literal("GET"),
  url: z.url(),
  status: z.number().int(),
  headers: z.record(z.string(), z.string()),
  body: z.string(),
});
export type Exchange = z.infer<typeof Exchange>;

/** `http.json.gz`: every response the fetcher saw, robots.txt included, in order. */
export const HttpFixture = z.object({
  version: z.literal(1),
  sourceKey: z.string(),
  recordedAt: z.iso.datetime(),
  exchanges: z.array(Exchange),
});
export type HttpFixture = z.infer<typeof HttpFixture>;

/**
 * `expected.json`: the golden fetch output. The rules extractor's drafts join it in M1.7.
 */
export const ExpectedFixture = z.object({
  sourceKey: z.string(),
  items: z.array(RawItemInput),
});
export type ExpectedFixture = z.infer<typeof ExpectedFixture>;

/** "hng/site" lives in "hng__site": one directory per source, no nesting. */
export class FixtureMissing extends Error {
  override readonly name = "FixtureMissing";
  constructor(readonly path: string) {
    super(`no fixture at ${path}; record one with \`pnpm engine record --source <key>\``);
  }
}

function readFixtureFile(path: string): Buffer {
  if (!existsSync(path)) throw new FixtureMissing(path);
  return readFileSync(path);
}

export function fixtureDir(sourceKey: string, root = FIXTURES_DIR): string {
  return resolve(root, sourceKey.replace("/", "__"));
}

export function exchangeKey(method: string, url: string): string {
  return `${method.toUpperCase()} ${url}`;
}

export function writeFixture(dir: string, http: HttpFixture, expected: ExpectedFixture): void {
  mkdirSync(dir, { recursive: true });
  // gzipSync leaves the header mtime at 0, so the same exchanges give the same bytes.
  writeFileSync(resolve(dir, "http.json.gz"), gzipSync(JSON.stringify(http)));
  writeExpected(dir, expected);
}

export function writeExpected(dir: string, expected: ExpectedFixture): void {
  writeFileSync(resolve(dir, "expected.json"), `${JSON.stringify(expected, null, 2)}\n`);
}

export function readHttpFixture(dir: string): HttpFixture {
  return HttpFixture.parse(
    JSON.parse(gunzipSync(readFixtureFile(resolve(dir, "http.json.gz"))).toString("utf8")),
  );
}

export function readExpected(dir: string): ExpectedFixture {
  return ExpectedFixture.parse(
    JSON.parse(readFixtureFile(resolve(dir, "expected.json")).toString("utf8")),
  );
}
