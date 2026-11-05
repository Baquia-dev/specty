// SPDX-License-Identifier: Apache-2.0
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

declare module "vitest" {
  export interface ProvidedContext {
    /** Where the suite writes its report: `specty-evals/` of the system's temporary folder. */
    readonly reports: string;
  }
}

/** `pnpm evals` sets it: the suite runs the agents. Otherwise only its tests, which judge. */
const suite = process.env.SPECTY_EVALS === "1";

export default defineConfig({
  test: {
    // Vitest's reporters, plus the JUnit report that `checks.testTime` reads.
    reporters: [...configDefaults.reporters, "junit"],
    outputFile: { junit: "coverage/junit.xml" },
    include: suite ? ["run/**/*.eval.ts"] : ["test/**/*.test.ts"],
    // The run's temporary files go in a folder of its own, removed at the end. The repositories'
    // hooks run the real bundle, so it is built first, as for the CLI's tests.
    globalSetup: ["../packages/core/vitest-temp-dir.ts", "../packages/cli/test/global-setup.ts"],
    // Read before the global setup points the temporary folder at the run's, which goes away.
    provide: { reports: join(tmpdir(), "specty-evals") },
    // A real agent may take minutes per run; the tests only set repositories up.
    testTimeout: suite ? 6 * 60 * 60 * 1000 : 120_000,
  },
});
