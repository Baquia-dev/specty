// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from "vitest/config";

/** `pnpm evals` sets it: the suite runs the agents. Otherwise only its tests, which judge. */
const suite = process.env.SPECTY_EVALS === "1";

export default defineConfig({
  test: {
    include: suite ? ["run/**/*.eval.ts"] : ["test/**/*.test.ts"],
    // The repositories' hooks run the real bundle, so it is built first, as for the CLI's tests.
    globalSetup: ["../packages/cli/test/global-setup.ts"],
    // A real agent may take minutes per run; the tests only set repositories up.
    testTimeout: suite ? 6 * 60 * 60 * 1000 : 120_000,
  },
});
