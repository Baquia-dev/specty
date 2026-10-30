// SPDX-License-Identifier: Apache-2.0
import { diffCoverage } from "./coverage";
import { testsLocked } from "./locked";
import { focusedTests, skippedTests, todo } from "./markers";
import { maxLines } from "./max-lines";
import type { Provider } from "./provider";
import { secrets } from "./secrets";
import { vulnerabilities } from "./vulnerabilities";

/** The checks that apply to every stack, whatever its language. */
export const commonProvider: Provider = {
  id: "common",
  applies: () => true,
  checks: [
    maxLines,
    focusedTests,
    skippedTests,
    todo,
    testsLocked,
    secrets,
    vulnerabilities,
    diffCoverage,
  ],
};
