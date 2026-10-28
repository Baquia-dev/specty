// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  type ChangeState,
  criterionMarks,
  parseSpec,
  type Spec,
  specDelta,
  type TestCycle,
  testCycle,
} from "@baquia-dev/specty-core";
import { readText } from "../io/files";
import type { Session } from "../session";
import { readRevision, type StoredChange } from "../store/changes";

/** What an approval decides about the change's tests (ADR 0014). */
interface AdjustedTests {
  /** The cycle the change follows before its code, if any. */
  readonly cycle: TestCycle | undefined;
  /** The approved tests that stay locked, if the change has any. */
  readonly lockedTests: ChangeState["lockedTests"];
}

/**
 * The cycle of tests an approval sends the change to, and the approved tests still locked. An
 * adjustment that modifies a criterion unlocks the tests that carry its id, and its tests wait
 * for the person again, whatever its tasks' type; otherwise the tasks still to do decide.
 */
export async function adjustedTests(
  session: Session,
  active: StoredChange,
  spec: Spec,
  done: ReadonlySet<string>,
): Promise<AdjustedTests> {
  const { state, files } = active;
  const policy = session.config.policy.tests;
  const before = await readRevision(files, state.approved?.revision);
  const modified =
    before === undefined
      ? []
      : specDelta(parseSpec(before).spec, spec)
          .entries.filter((entry) => entry.kind === "criterion" && entry.change === "modified")
          .map((entry) => entry.key);
  const pending = (spec.sections.tasks?.items ?? []).some((task) => !done.has(task.id));
  const cycle =
    policy === "contract" && modified.length > 0 && pending
      ? "feature"
      : testCycle(spec, policy, done);
  if (state.lockedTests === undefined) return { cycle, lockedTests: undefined };
  const unlocked = new Set(await carrying(session, Object.keys(state.lockedTests), modified));
  const lockedTests = Object.fromEntries(
    Object.entries(state.lockedTests).filter(([path]) => !unlocked.has(path)),
  );
  return { cycle, lockedTests };
}

/** The tests among `paths` with a name or comment line that carries one of `ids`. */
async function carrying(
  session: Session,
  paths: readonly string[],
  ids: readonly string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  const found = await Promise.all(
    paths.map(async (path) => {
      const text = await readText(join(session.root, path));
      return text !== undefined && criterionMarks(text, ids).length > 0 ? [path] : [];
    }),
  );
  return found.flat();
}

/** The cycle of a change in the testing phase: the one its approval decided, or its tasks'. */
export function cycleOf(session: Session, state: ChangeState, spec: Spec): TestCycle | undefined {
  return state.testCycle ?? testCycle(spec, session.config.policy.tests, doneOf(state));
}

/** The ids of the change's tasks already done. */
export function doneOf(state: ChangeState): ReadonlySet<string> {
  return new Set(
    Object.entries(state.tasks).flatMap(([id, task]) => (task.status === "done" ? [id] : [])),
  );
}
