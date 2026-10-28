// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  type AssertionLoss,
  type ChangeState,
  hashText,
  type LongFile,
  moduleOf,
  type RiskFinding,
  type Spec,
  serializeSpec,
  shortHash,
  type Task,
  transition,
  verifyingNote,
} from "@baquia-dev/specty-core";
import { tail } from "../io/exec";
import { readText, writeText } from "../io/files";
import type { Session } from "../session";
import type { StoredChange } from "../store/changes";
import { commitState } from "./active";
import { changeTrailers, commitWithReceipt } from "./commits";
import { runLive } from "./live-run";
import { codeTree } from "./verified";
import { taskVerification } from "./views";

/**
 * What `task.completed` keeps besides the summary, when there is any: what the task's diff shows
 * the person on acceptance, and what the agent learned for the tasks and changes after.
 */
export interface TaskNotes {
  readonly removedAssertions: readonly AssertionLoss[];
  readonly risks: readonly RiskFinding[];
  readonly findings: readonly string[];
  /** Files left past the warning line; a block never gets this far. */
  readonly longFiles: readonly LongFile[];
}

export type TaskVerification =
  | { readonly ok: true; readonly change: StoredChange }
  | {
      readonly ok: false;
      readonly command: string;
      readonly code: number | undefined;
      readonly tail: string[];
    };

/** Runs the task's verification, if it has one, and records the attempt as `task.verified`. */
export async function verifyTask(
  session: Session,
  change: StoredChange,
  task: Task,
): Promise<TaskVerification> {
  const command = taskVerification(session, task);
  if (command === undefined) return { ok: true, change };
  session.environment.io.err(verifyingNote(command, session.lang));
  // The code it runs on, before it runs: `accept` need not verify it again (formats.md §4).
  const tree = await codeTree(session);
  const started = Date.now();
  // Live while it runs, so the local server can show it.
  const result = await runLive(session, change.state.id, task.id, command);
  const passed = result.code === 0;
  const output = tail(result);
  const stored = change.state.tasks[task.id];
  const state: ChangeState = {
    ...change.state,
    tasks: {
      ...change.state.tasks,
      [task.id]: {
        status: "active",
        scopeExtra: stored?.scopeExtra ?? [],
        ...stored,
        attempts: (stored?.attempts ?? 0) + 1,
      },
    },
  };
  const updated = await commitState(
    session,
    change,
    state,
    "task.verified",
    {
      task: task.id,
      cmd: command,
      exit: result.code ?? null,
      ms: Date.now() - started,
      ...(tree === undefined ? {} : { tree }),
      ...(passed ? {} : { outputTail: output.slice(-10) }),
    },
    "specty",
  );
  return passed
    ? { ok: true, change: updated }
    : { ok: false, command, code: result.code, tail: output };
}

/**
 * The approved tests once `task` is done: each one the person unlocked for it is locked again
 * with its new content, and one that is gone is no longer locked (ADR 0014). Undefined without
 * approved tests.
 */
async function relock(
  session: Session,
  state: ChangeState,
  task: string,
): Promise<ChangeState["lockedTests"]> {
  if (state.lockedTests === undefined) return undefined;
  const unlocked = new Set(state.tasks[task]?.scopeExtra ?? []);
  const entries = await Promise.all(
    Object.entries(state.lockedTests).map(async ([path, hash]) => {
      if (!unlocked.has(path)) return [[path, hash] as const];
      const text = await readText(join(session.root, path));
      return text === undefined ? [] : [[path, hashText(text)] as const];
    }),
  );
  return Object.fromEntries(entries.flat());
}

/** Marks the task done, ticks it in the spec and commits code and state together. */
export async function completeTask(
  session: Session,
  change: StoredChange,
  spec: Spec,
  task: Task,
  summary: string,
  notes: TaskNotes,
): Promise<StoredChange & { readonly commit: string }> {
  const { state } = change;
  const now = session.environment.now().toISOString();
  const tasks = {
    ...state.tasks,
    [task.id]: {
      status: "done" as const,
      scopeExtra: state.tasks[task.id]?.scopeExtra ?? [],
      attempts: state.tasks[task.id]?.attempts ?? 1,
      ...withoutStatus(state.tasks[task.id]),
      doneAt: now,
      summary,
    },
  };
  const remaining = (spec.sections.tasks?.items ?? []).filter(
    (item) => tasks[item.id]?.status !== "done",
  ).length;
  const moved = transition({
    phase: "implementing",
    kind: state.kind,
    actor: session.actor,
    event: { type: "taskDone", remainingTasks: remaining },
  });
  const phase = moved.ok ? moved.phase : state.phase;
  await writeText(change.files.spec, serializeSpec(ticked(spec, tasks)));
  const relocked = await relock(session, state, task.id);
  const next = {
    ...state,
    phase,
    tasks,
    ...(relocked === undefined ? {} : { lockedTests: relocked }),
  };
  const updated = await commitState(session, change, next, "task.completed", {
    task: task.id,
    summary,
    // Only the notes there are: `removedAssertions`, `risks`, `findings`.
    ...Object.fromEntries(Object.entries(notes).filter(([, list]) => list.length > 0)),
  });
  const commit = await commitTask(session, change, task);
  return { ...updated, commit };
}

/** Commits the task's code with its spec and state, under its type and its files' module. */
async function commitTask(session: Session, change: StoredChange, task: Task): Promise<string> {
  const { state } = change;
  const relativeDir = session.paths.relative(change.files.dir);
  const scope = moduleOf(task.files[0] ?? "");
  const subject = `${task.type ?? "feat"}${scope === "(root)" ? "" : `(${scope})`}: ${task.title}`;
  return commitWithReceipt(session, {
    subject,
    trailers: changeTrailers(session, state.id, {
      "Specty-Task": task.id,
      "Specty-Spec": `r${state.approved?.revision ?? state.revision}@${shortHash(state.approved?.hash ?? "")}`,
    }),
    stage: [[".", ":(exclude).specty"], [relativeDir]],
    receipt: { change: state.id, kind: "task", task: task.id },
  });
}

function withoutStatus(stored: ChangeState["tasks"][string] | undefined) {
  if (stored === undefined) return {};
  const { status: _status, ...rest } = stored;
  return rest;
}

/** The spec with each task's checkbox matching its state. */
function ticked(spec: Spec, tasks: ChangeState["tasks"]): Spec {
  const list = spec.sections.tasks;
  if (list === undefined) return spec;
  const items = list.items.map((item) => ({ ...item, done: tasks[item.id]?.status === "done" }));
  return { ...spec, sections: { ...spec.sections, tasks: { ...list, items } } };
}
