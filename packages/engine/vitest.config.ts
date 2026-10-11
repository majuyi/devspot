import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Every test file runs with undici's global dispatcher refusing all network access.
    setupFiles: ["./test/setup.ts"],
  },
});
