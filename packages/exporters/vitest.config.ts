// SPDX-License-Identifier: Apache-2.0
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Vitest's reporters, plus the JUnit report that `checks.testTime` reads.
    reporters: [...configDefaults.reporters, "junit"],
    outputFile: { junit: "coverage/junit.xml" },
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
