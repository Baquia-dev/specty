// SPDX-License-Identifier: Apache-2.0
import { type Finding, hashText, translator } from "@baquia-dev/specty-core";
import { listOpenChanges } from "../store/changes";
import type { CheckDefinition } from "./provider";

/**
 * The tests a person approved still match the hash kept when they did (ADR 0014). It looks at
 * every change open in this folder, whatever the branch, so the CI of a pull request runs it
 * too: the guard stops the agent's edits, and this catches the rest.
 */
export const testsLocked: CheckDefinition = {
  id: "tests-locked",
  async run(context) {
    const t = translator(context.session.lang);
    const changes = await listOpenChanges(context.session.paths);
    const locked = changes.flatMap(({ state }) => Object.entries(state.lockedTests ?? {}));
    // Without approved tests here, as without `policy.tests: contract`, it is not reported at all.
    if (locked.length === 0) return { inapplicable: true };
    // A test the person unlocked for an active task may change until that task is done.
    const unlocked = new Set(
      changes.flatMap(({ state }) =>
        Object.values(state.tasks).flatMap((task) =>
          task.status === "active" ? task.scopeExtra : [],
        ),
      ),
    );
    const findings = await Promise.all(
      locked.map(async ([path, hash]): Promise<Finding[]> => {
        if (unlocked.has(path)) return [];
        const text = await context.read(path);
        if (text !== undefined && hashText(text) === hash) return [];
        const message =
          text === undefined
            ? t("test aprobado y bloqueado: falta", "approved and locked test: it is missing")
            : t(
                "test aprobado y bloqueado: cambió desde que la persona lo aprobó",
                "approved and locked test: it changed since the person approved it",
              );
        return [{ path, message }];
      }),
    );
    return { findings: findings.flat() };
  },
};
