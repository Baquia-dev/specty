// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from "vitest/config";

const isSingleTest = process.argv
  .slice(2)
  .some((arg) => arg.includes("test/") || arg.endsWith(".test.ts"));

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text-summary", "lcovonly"],
      // ARCHITECTURE §16: the core keeps at least 90 % coverage.
      thresholds: isSingleTest ? {} : { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
