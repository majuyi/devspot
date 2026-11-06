import { describe, expect, it } from "vitest";

describe("db client", () => {
  it("imports without DATABASE_URL and throws MissingDatabaseUrlError on first use", async () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const { db, MissingDatabaseUrlError } = await import("../src/client.ts");
      expect(() => db.opportunity).toThrow(MissingDatabaseUrlError);
    } finally {
      if (saved !== undefined) process.env.DATABASE_URL = saved;
    }
  });
});
