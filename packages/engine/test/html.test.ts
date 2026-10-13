import type { RawItemInput } from "@devspot/schema";
import { describe, expect, it } from "vitest";
import type { Adapter } from "../src/adapter.js";
import type { FetchSource } from "../src/fetch.js";
import { AdapterNotFound, AdapterOutputInvalid, fetchWithAdapter } from "../src/fetchers/html.js";
import { HttpClient } from "../src/http.js";

const source: FetchSource = {
  key: "example/jobs",
  organizationSlug: "example",
  kind: "html",
  url: "https://example.org/jobs",
  adapter: "example",
};
const http = new HttpClient();
const adapters = (fetch: Adapter["fetch"]) => new Map([["example", { key: "example", fetch }]]);

describe("fetchWithAdapter", () => {
  it("returns the adapter's items", async () => {
    const item = { url: "https://example.org/jobs/1", title: "Intern", text: "Apply by 1 Nov." };
    const result = await fetchWithAdapter(
      source,
      http,
      adapters(async () => [item]),
    );
    expect(result).toEqual({ items: [item] });
  });

  it("throws AdapterNotFound for an unknown or missing adapter", async () => {
    await expect(
      fetchWithAdapter(
        { ...source, adapter: "nope" },
        http,
        adapters(async () => []),
      ),
    ).rejects.toBeInstanceOf(AdapterNotFound);
    const { adapter: _, ...noAdapter } = source;
    await expect(
      fetchWithAdapter(
        noAdapter,
        http,
        adapters(async () => []),
      ),
    ).rejects.toThrow("has no adapter");
  });

  it("throws AdapterOutputInvalid naming the item and field", async () => {
    const bad = [
      { url: "https://example.org/1", text: "ok" },
      { url: "not a url", text: "" },
    ];
    const run = fetchWithAdapter(
      source,
      http,
      adapters(async () => bad as RawItemInput[]),
    );
    await expect(run).rejects.toBeInstanceOf(AdapterOutputInvalid);
    await expect(run).rejects.toThrow(/adapter example item 1: url: .*; text: /);
  });
});
