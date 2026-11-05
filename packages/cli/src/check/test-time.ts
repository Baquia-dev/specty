// SPDX-License-Identifier: Apache-2.0
import { dirname, join } from "node:path";
import {
  type Finding,
  parseJunit,
  slowTestMessage,
  slowTests,
  type TestTime,
} from "@baquia-dev/specty-core";
import { readText } from "../io/files";
import type { Session } from "../session";
import { deepest, folderChain, freshReports } from "./coverage";
import type { CheckDefinition } from "./provider";

/**
 * The tests that take longer than `checks.testTime.maxMs` (`test-time`), from the JUnit reports
 * the project's tests left during this run: like `diff-coverage`, it runs after the other checks
 * and reads only the reports written since the run started. It only warns.
 */
export const testTime: CheckDefinition = {
  id: "test-time",
  after: true,
  async run({ session, started }) {
    const config = session.config.checks.testTime;
    const slow = await slowTestsSince(session, started);
    if (config === undefined || slow === undefined) return { inapplicable: true };
    return {
      findings: slow.map(
        (test): Finding => ({
          ...(test.path === undefined ? {} : { path: test.path }),
          message: slowTestMessage(test, config.maxMs, session.lang),
          severity: "warning",
        }),
      ),
    };
  },
};

/**
 * The tests over `checks.testTime.maxMs` in the reports of `checks.testTime.reports` written
 * since `started`, the longest first: what `test-time` warns of, and what the note of a full
 * verification shows. Undefined without `checks.testTime` or without a fresh report.
 */
export async function slowTestsSince(
  session: Session,
  started: number,
): Promise<readonly TestTime[] | undefined> {
  const config = session.config.checks.testTime;
  if (config === undefined) return undefined;
  const { root } = session;
  const reports = await freshReports(root, config.reports, started);
  if (reports.length === 0) return undefined;
  const read = await Promise.all(
    reports.map(async (report) => {
      const tests = parseJunit((await readText(join(root, report))) ?? "", root);
      return Promise.all(
        slowTests(tests, config.maxMs).map((test) => anchored(root, report, test)),
      );
    }),
  );
  return slowTests(read.flat(), config.maxMs);
}

/**
 * A tool writes a test's file relative to where it ran (a package of a monorepo, say): a relative
 * one becomes the deepest file that exists, from the report's folder up to the root. Otherwise it
 * stays as the report names it.
 */
async function anchored(root: string, report: string, test: TestTime): Promise<TestTime> {
  if (test.path === undefined || test.path.startsWith("/")) return test;
  const path = await deepest(root, folderChain(dirname(report)), test.path);
  return path === undefined ? test : { ...test, path };
}
