import { defineConfig } from "vitest/config";

// Smoke tests hit a live deployment over HTTP; see smoke/production.smoke.test.ts.
export default defineConfig({
  test: {
    include: ["smoke/**/*.smoke.test.ts"],
    testTimeout: 30_000,
  },
});
