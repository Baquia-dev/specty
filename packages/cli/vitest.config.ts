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
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    // The run's temporary files go in a folder of its own, removed at the end. Git hooks run the
    // real bundle, so it is built once before the tests.
    globalSetup: ["../core/vitest-temp-dir.ts", "test/global-setup.ts"],
    // Many tests run the real flow, with git and its hooks: the slowest takes about 35 s in a full
    // run, and a loaded machine (several sessions verifying at once) multiplies it. A test that
    // hangs still fails long before the full verification's own limit (`verify.timeoutSec`).
    testTimeout: 300_000,
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/main.ts", "src/terminal.ts"],
      reporter: ["text-summary", "lcovonly"],
      thresholds: isSingleTest ? {} : { lines: 80, statements: 80, functions: 80, branches: 70 },
    },
  },
});
