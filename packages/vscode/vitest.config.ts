// SPDX-License-Identifier: Apache-2.0
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Vitest's reporters, plus the JUnit report that `checks.testTime` reads.
    reporters: [...configDefaults.reporters, "junit"],
    outputFile: { junit: "coverage/junit.xml" },
    include: ["test/**/*.test.ts"],
    // The run's temporary files go in a folder of its own, removed at the end.
    globalSetup: ["../core/vitest-temp-dir.ts"],
    // The tests start Node, which may take seconds on a busy machine: 30 s for each, not 5.
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text-summary", "lcovonly"],
      // Like the CLI's: code that talks to processes and to VS Code.
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
    },
  },
});
