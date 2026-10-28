// SPDX-License-Identifier: Apache-2.0
import type { ChangeView, Spec, TaskView } from "@baquia-dev/specty-core";
import type { Session } from "../session";
import type { StoredChange } from "../store/changes";
import { type Audit, dataOf } from "./carried";
import { criteriaTests } from "./criteria-tests";

/**
 * What the view of a change in acceptance adds: a review recommended first, each criterion with
 * its tests (an epic's criteria are its slices') and each approved test a person unlocked.
 */
export async function acceptanceFacts(
  session: Session,
  change: StoredChange,
  spec: Spec,
  read: {
    readonly tasks: readonly TaskView[];
    readonly audit: Audit;
    readonly commits: ReadonlyMap<string, string>;
  },
): Promise<Pick<ChangeView, "recommendReview" | "criteriaTests" | "unlockedTests">> {
  const { tasks, audit, commits } = read;
  return {
    ...(resultReview(session, change, tasks, audit) ? { recommendReview: true } : {}),
    ...(change.state.kind !== "epic"
      ? { criteriaTests: await criteriaTests(session, spec, commits) }
      : {}),
    ...unlockedTests(audit),
  };
}

/**
 * An independent review of the result (ADR 0011) comes before the acceptance of a large change,
 * or of one whose tasks removed assertions or added risks, until one follows its last task.
 */
function resultReview(
  session: Session,
  change: StoredChange,
  tasks: readonly TaskView[],
  audit: Audit,
): boolean {
  if (session.config.review === undefined) return false;
  const level = change.state.size?.level;
  const warned = tasks.some(
    (task) => (task.risks?.length ?? 0) > 0 || (task.removedAssertions?.length ?? 0) > 0,
  );
  if (level !== "L" && level !== "XL" && !warned) return false;
  const lastTask = audit.findLastIndex((entry) => entry.event === "task.completed");
  const lastReview = audit.findLastIndex(
    (entry) => entry.event === "review.completed" && dataOf(entry).target === "diff",
  );
  return lastReview < lastTask;
}

/** Each approved test a person unlocked (`scope.decided` with `unlock`), for the acceptance. */
function unlockedTests(audit: Audit): {
  readonly unlockedTests?: NonNullable<ChangeView["unlockedTests"]>;
} {
  const unlocked = audit.flatMap((entry) => {
    const data = dataOf(entry);
    if (entry.event !== "scope.decided" || !Array.isArray(data.unlock)) return [];
    const { id, task } = data;
    if (typeof id !== "string" || typeof task !== "string") return [];
    return data.unlock.flatMap((path) =>
      typeof path === "string" ? [{ path, request: id, task }] : [],
    );
  });
  return unlocked.length > 0 ? { unlockedTests: unlocked } : {};
}
