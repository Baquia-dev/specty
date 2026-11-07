// SPDX-License-Identifier: Apache-2.0
import * as z from "zod";

/**
 * The checks of `specty check` that `task done` always runs, guarantees of Specty: the approved
 * plan's, which `--spec` adds, and the approved tests' (formats.md §6).
 */
const GUARANTEED = new Set([
  "spec-approved",
  "scope",
  "dependencies",
  "fix-tests",
  "criteria-tested",
  "tests-removed",
  "tests-locked",
]);

/** `checks.taskDone` in `.specty/config.yaml`: what `task done` leaves out of `specty check`. */
export interface TaskDoneChecks {
  /**
   * Ids of the checks it does not run, on top of `scope` and `max-lines`, which it checks itself,
   * and, when the task has a verification, the project's commands. `specty check` still runs them.
   */
  readonly skip: readonly string[];
}

export const DEFAULT_TASK_DONE: TaskDoneChecks = { skip: [] };

export const TaskDoneSchema = z.strictObject({
  skip: z
    .array(z.string().min(1))
    .superRefine((ids, context) => {
      ids.forEach((id, index) => {
        if (!GUARANTEED.has(id)) return;
        context.addIssue({
          code: "custom",
          path: [index],
          message: `«${id}» is one of Specty's guarantees: task done always runs it.`,
        });
      });
    })
    .optional(),
});

/** The checks `task done` leaves out, none without the key. */
export function resolveTaskDone(input: z.infer<typeof TaskDoneSchema> | undefined): TaskDoneChecks {
  return { skip: input?.skip ?? DEFAULT_TASK_DONE.skip };
}
