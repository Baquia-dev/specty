// SPDX-License-Identifier: Apache-2.0
import { configDefaults, defineConfig } from "vitest/config";

// `angular.json` loads it (`runnerConfig`): the builder's own `reporters` would replace Vitest's.
export default defineConfig({
  test: {
    // Vitest's reporters, plus the JUnit report that `checks.testTime` reads.
    reporters: [...configDefaults.reporters, "junit"],
    outputFile: { junit: "coverage/junit.xml" },
  },
});
