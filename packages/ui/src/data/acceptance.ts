// SPDX-License-Identifier: Apache-2.0
// What the Acceptance tab shows: each criterion with the tasks that cover it, and the person's
// decision on the result. Pure: it reads the views the worker already derived.
import type { TaskProgressView } from "./progress";
import type { CriterionTest, CriterionTests, CriterionView } from "./records";

/** Accepting the result, or asking for adjustments in the person's own words (`specty adjust`). */
export type ResultDecision =
  | { readonly kind: "accept" }
  | { readonly kind: "adjust"; readonly request: string };

/**
 * How far a criterion's evidence goes: every task covering it done and verified, done with no
 * verification on record, some task still to do, or no task at all.
 */
export type EvidenceStatus = "verified" | "unverified" | "pending" | "uncovered";

export interface CriterionEvidence {
  readonly id: string;
  readonly text: string;
  /** The tasks that list it in `ac`, in the spec's order. */
  readonly tasks: readonly TaskProgressView[];
  readonly status: EvidenceStatus;
  /** The tests that carry its id, at most `SHOWN`; none when the source does not know them. */
  readonly tests?: readonly CriterionTest[];
  /** How many more tests carry its id than are shown. */
  readonly more?: number;
  /** `test: manual`: the person checks it by hand. */
  readonly manual?: true;
  /** A task owed it a test and none carries its id (ADR 0014). */
  readonly untested?: true;
}

/** Tests shown per criterion, as the acceptance card of the CLI. */
const SHOWN = 3;

/** «2 de 2 criterios verificados · 2 tareas hechas · 2 commits», as counts. */
export interface EvidenceSummary {
  readonly verified: number;
  readonly criteria: number;
  readonly done: number;
  readonly tasks: number;
  readonly commits: number;
}

function statusOf(tasks: readonly TaskProgressView[]): EvidenceStatus {
  if (tasks.length === 0) return "uncovered";
  if (tasks.some((task) => task.status !== "done")) return "pending";
  return tasks.every((task) => task.verification?.passed === true) ? "verified" : "unverified";
}

/**
 * Each criterion with the tasks that cover it and what they prove so far, and, when the source
 * sends them (`criteriaTests`), the tests that carry its id.
 */
export function evidenceOf(
  criteria: readonly CriterionView[],
  tasks: readonly TaskProgressView[],
  criteriaTests?: readonly CriterionTests[],
): readonly CriterionEvidence[] {
  return criteria.map((criterion) => {
    const covering = tasks.filter((task) => task.criteria.includes(criterion.id));
    return {
      id: criterion.id,
      text: criterion.text,
      tasks: covering,
      status: statusOf(covering),
      ...(criterion.manual ? { manual: true } : {}),
      ...testsOf(criterion, criteriaTests),
    };
  });
}

/** The tests of a criterion, and whether it owed one it does not have; nothing without them. */
function testsOf(
  criterion: CriterionView,
  criteriaTests: readonly CriterionTests[] | undefined,
): Pick<CriterionEvidence, "tests" | "more" | "untested"> {
  if (criteriaTests === undefined) return {};
  const found = criteriaTests.find((item) => item.id === criterion.id);
  const tests = found?.tests ?? [];
  const untested = found?.owed === true && tests.length === 0 && !criterion.manual;
  return {
    tests: tests.slice(0, SHOWN),
    more: Math.max(0, tests.length - SHOWN),
    ...(untested ? { untested: true } : {}),
  };
}

export function summaryOf(
  evidence: readonly CriterionEvidence[],
  tasks: readonly TaskProgressView[],
): EvidenceSummary {
  const done = tasks.filter((task) => task.status === "done");
  return {
    verified: evidence.filter((criterion) => criterion.status === "verified").length,
    criteria: evidence.length,
    done: done.length,
    tasks: tasks.length,
    commits: new Set(done.flatMap((task) => (task.commit === undefined ? [] : [task.commit]))).size,
  };
}
