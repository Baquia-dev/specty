// SPDX-License-Identifier: Apache-2.0
import { configDefaults, defineConfig } from "vitest/config";

const isSingleTest = process.argv
  .slice(2)
  .some((arg) => arg.includes("test/") || arg.endsWith(".test.ts"));

export default defineConfig({
  test: {
    // Vitest's reporters, plus the JUnit report that `checks.testTime` reads.
    reporters: [...configDefaults.reporters, "junit"],
    outputFile: { junit: "coverage/junit.xml" },
    include: ["test/**/*.test.ts"],
    // The run's temporary files go in a folder of its own, removed at the end.
    globalSetup: ["vitest-temp-dir.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text-summary", "lcovonly"],
      // ARCHITECTURE §16: the core keeps at least 90 % coverage.
      thresholds: isSingleTest ? {} : { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
