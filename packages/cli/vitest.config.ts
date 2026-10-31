// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from "vitest/config";

const isSingleTest = process.argv
  .slice(2)
  .some((arg) => arg.includes("test/") || arg.endsWith(".test.ts"));

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    // Git hooks run the real bundle, so it is built once before the tests.
    globalSetup: ["test/global-setup.ts"],
    testTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/main.ts", "src/terminal.ts"],
      reporter: ["text-summary", "lcovonly"],
      thresholds: isSingleTest ? {} : { lines: 80, statements: 80, functions: 80, branches: 70 },
    },
  },
});
