// SPDX-License-Identifier: Apache-2.0
import { configDefaults, defineConfig } from "vitest/config";

// `angular.json` loads it (`runnerConfig`): the builder's own `reporters` would replace Vitest's.
export default defineConfig({
  test: {
    // Vitest's reporters, plus the JUnit report that `checks.testTime` reads.
    reporters: [...configDefaults.reporters, "junit"],
    outputFile: { junit: "coverage/junit.xml" },
    // The run's temporary files go in a folder of its own, removed at the end. The builder runs
    // Vitest from `packages/ui`.
    globalSetup: ["../core/vitest-temp-dir.ts"],
  },
});
