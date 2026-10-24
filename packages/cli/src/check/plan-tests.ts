// SPDX-License-Identifier: Apache-2.0
import {
  type Finding,
  isImplicitTest,
  isTestFile,
  matchesAny,
  testCases,
  translator,
} from "@baquia-dev/specty-core";
import type { LoadedPlan } from "./plan";
import type { CheckContext, CheckDefinition } from "./provider";

/** What the plan says about tests: each `fix` brings one, and no test goes away unnoticed. */

/**
 * Each `fix` task being worked on, or done, has a test of its own in the diff: in its `files`,
 * in its approved extensions, or next to them. With `--staged`, a task already done made its
 * commit, so only the active one counts.
 */
export function fixTests(plan: LoadedPlan): CheckDefinition {
  return {
    id: "fix-tests",
    async run({ session, mode, files }) {
      const t = translator(session.lang);
      const tests = files.filter(isTestFile);
      const findings = (plan.spec.sections.tasks?.items ?? [])
        .filter((task) => {
          const status = plan.state.tasks[task.id]?.status;
          return (
            task.type === "fix" && (status === "active" || (status === "done" && mode !== "staged"))
          );
        })
        .filter((task) => {
          const scope = [...task.files, ...(plan.state.tasks[task.id]?.scopeExtra ?? [])];
          return !tests.some((path) => matchesAny(path, scope) || isImplicitTest(path, scope));
        })
        .map(
          (task): Finding => ({
            message: t(
              `${task.id} es un fix y el diff no trae ningún test suyo`,
              `${task.id} is a fix and the diff brings none of its tests`,
            ),
          }),
        );
      return { findings };
    },
  };
}

/** Tests the diff deletes or leaves with fewer cases than where the run starts: only a warning. */
export const testsRemoved: CheckDefinition = {
  id: "tests-removed",
  async run(context) {
    const t = translator(context.session.lang);
    const deleted = context.deleted.filter(isTestFile).map(
      (path): Finding => ({
        path,
        message: t("test borrado", "test deleted"),
        severity: "warning",
      }),
    );
    const fewer = await Promise.all(
      context.files.filter(isTestFile).map((path) => lost(context, path)),
    );
    const findings = [...deleted, ...fewer.flat()].toSorted((a, b) =>
      (a.path ?? "").localeCompare(b.path ?? ""),
    );
    return { findings };
  },
};

async function lost(context: CheckContext, path: string): Promise<Finding[]> {
  const [before, now] = await Promise.all([context.before(path), context.read(path)]);
  if (before === undefined || now === undefined) return [];
  const [from, to] = [testCases(before), testCases(now)];
  if (to >= from) return [];
  const t = translator(context.session.lang);
  const count = from - to;
  const message =
    count === 1
      ? t(`1 caso menos (de ${from} a ${to})`, `1 fewer case (from ${from} to ${to})`)
      : t(
          `${count} casos menos (de ${from} a ${to})`,
          `${count} fewer cases (from ${from} to ${to})`,
        );
  return [{ path, message, severity: "warning" }];
}
