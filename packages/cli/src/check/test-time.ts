// SPDX-License-Identifier: Apache-2.0
import { dirname, join } from "node:path";
import {
  type FailedTest,
  type Finding,
  parseJunit,
  parseJunitFailures,
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
  const maxMs = session.config.checks.testTime?.maxMs;
  const reports = await reportsSince(session, started);
  if (maxMs === undefined || reports === undefined) return undefined;
  const read = await Promise.all(
    reports.map(({ path, text }) =>
      Promise.all(
        slowTests(parseJunit(text, session.root), maxMs).map((test) =>
          anchored(session.root, path, test),
        ),
      ),
    ),
  );
  return slowTests(read.flat(), maxMs);
}

/**
 * The tests that failed in the reports of `checks.testTime.reports` written since `started`, in
 * the order of the reports: what the fresh verification names of an attempt that failed. None
 * without `checks.testTime` or without a fresh report.
 */
export async function failedTestsSince(
  session: Session,
  started: number,
): Promise<readonly FailedTest[]> {
  const reports = (await reportsSince(session, started)) ?? [];
  const read = await Promise.all(
    reports.map(({ path, text }) =>
      Promise.all(
        parseJunitFailures(text, session.root).map((test) => anchored(session.root, path, test)),
      ),
    ),
  );
  return read.flat();
}

/**
 * Each report of `checks.testTime.reports` written since `started`, with its text. Undefined
 * without `checks.testTime` or without a fresh report.
 */
async function reportsSince(
  session: Session,
  started: number,
): Promise<readonly { readonly path: string; readonly text: string }[] | undefined> {
  const config = session.config.checks.testTime;
  if (config === undefined) return undefined;
  const { root } = session;
  const paths = await freshReports(root, config.reports, started);
  if (paths.length === 0) return undefined;
  return Promise.all(
    paths.map(async (path) => ({ path, text: (await readText(join(root, path))) ?? "" })),
  );
}

/**
 * A tool writes a test's file relative to where it ran (a package of a monorepo, say): a relative
 * one becomes the deepest file that exists, from the report's folder up to the root. Otherwise it
 * stays as the report names it.
 */
async function anchored<T extends FailedTest>(root: string, report: string, test: T): Promise<T> {
  if (test.path === undefined || test.path.startsWith("/")) return test;
  const path = await deepest(root, folderChain(dirname(report)), test.path);
  return path === undefined ? test : { ...test, path };
}
