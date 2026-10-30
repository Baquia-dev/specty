// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text-summary", "lcovonly"],
      // Pure functions, as core: at least 90 % coverage.
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
