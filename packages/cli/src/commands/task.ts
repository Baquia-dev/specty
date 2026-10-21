// SPDX-License-Identifier: Apache-2.0
import {
  blockedCard,
  type ChangeState,
  evaluateTaskScope,
  headerOf,
  isGoverned,
  moduleOf,
  nextCard,
  type Output,
  outOfScopeCard,
  parseSpec,
  type Spec,
  scopeRulesFrom,
  serializeSpec,
  shortHash,
  specHash,
  type Task,
  transition,
  translator,
  verifyFailedCard,
  withLead,
} from "@baquia-dev/specty-core";
import { commitState, resolveActive } from "../flow/active";
import { changeTrailers, commitWithReceipt } from "../flow/commits";
import { changeView } from "../flow/views";
import { execute, tail } from "../io/exec";
import { writeText } from "../io/files";
import type { Session } from "../session";
import { readSpec, type StoredChange } from "../store/changes";
import { activateNextTask } from "./next";

/** `specty task done`: checks scope, runs the verification, commits and moves on. */
export async function taskDone(session: Session, taskId: string, summary: string): Promise<Output> {
  const t = translator(session.lang);
  const { cards } = session;
  const nextStep = t(`ejecuta \`${cards.command} next\`.`, `run \`${cards.command} next\`.`);
  const active = await resolveActive(session);
  if (active === undefined || active.state.phase !== "implementing") {
    const header =
      active === undefined ? headerOf() : headerOf(active.state.id, active.state.phase);
    return blockedCard(
      header,
      t("No hay ninguna tarea en implementación.", "No task is being implemented."),
      nextStep,
    );
  }
  const { state } = active;
  const header = headerOf(state.id, "implementing");
  const id = taskId.trim().toUpperCase();
  if (state.tasks[id]?.status !== "active") {
    return blockedCard(
      header,
      t(`${id} no es la tarea activa.`, `${id} is not the active task.`),
      nextStep,
    );
  }
  if (summary.trim().length === 0) {
    return {
      ...blockedCard(
        header,
        t("Falta el resumen (--summary).", "The summary (--summary) is missing."),
        t(
          `ejecuta \`${cards.command} task done ${id} --summary "<qué hiciste>"\`.`,
          `run \`${cards.command} task done ${id} --summary "<what you did>"\`.`,
        ),
      ),
      status: "invalid",
    };
  }
  const spec = parseSpec(await readSpec(active.files), { language: session.lang }).spec;
  const task = spec.sections.tasks?.items.find((item) => item.id === id);
  if (
    task === undefined ||
    state.approved === undefined ||
    specHash(spec) !== state.approved.hash
  ) {
    return nextCard({ change: await changeView(session, active), dirty: [] }, cards);
  }
  const pending = state.pending.scopeRequests.find((request) => request.task === id);
  if (pending !== undefined) {
    return blockedCard(
      header,
      t(
        `${id} espera la decisión sobre ${pending.id}.`,
        `${id} is waiting for the decision on ${pending.id}.`,
      ),
      t(
        `sigue dentro del alcance y pide al usuario \`${cards.command} approve --scope ${pending.id}\`.`,
        `keep working within the scope and ask the user for \`${cards.command} approve --scope ${pending.id}\`.`,
      ),
    );
  }
  const stored = state.tasks[id];
  const changed = await session.git.changedSince(stored?.baseCommit);
  const governed = changed.filter(
    (file) =>
      !file.path.startsWith(".specty/") &&
      (isGoverned(file.path, session.config) ||
        (file.from !== undefined && isGoverned(file.from, session.config))),
  );
  const scope = evaluateTaskScope({
    changed: governed,
    taskFiles: task.files,
    extras: stored?.scopeExtra ?? [],
    rules: scopeRulesFrom(session.config),
  });
  if (!scope.ok) return outOfScopeCard(header, id, scope.outOfScope, cards);

  const verified = await verify(session, active, task);
  if (!verified.ok)
    return verifyFailedCard(header, id, verified.command, verified.code, verified.tail, cards);

  const done = await complete(session, verified.change, spec, task, summary.trim());
  const following =
    done.state.phase === "implementing" ? await activateNextTask(session, done) : done;
  return withLead(
    t(`${id} completada: commit ${done.commit}.`, `${id} done: commit ${done.commit}.`),
    nextCard({ change: await changeView(session, following), dirty: [] }, cards),
  );
}

type Verification =
  | { readonly ok: true; readonly change: StoredChange }
  | {
      readonly ok: false;
      readonly command: string;
      readonly code: number | undefined;
      readonly tail: string[];
    };

async function verify(session: Session, change: StoredChange, task: Task): Promise<Verification> {
  const command = task.verify ?? session.config.verify.default;
  if (command === undefined) return { ok: true, change };
  session.environment.io.err(
    `specty: ${translator(session.lang)("verificando", "verifying")} \`${command}\`…`,
  );
  const started = Date.now();
  const result = await execute(command, [], {
    cwd: session.root,
    shell: true,
    env: session.environment.env,
    timeoutMs: session.config.verify.timeoutSec * 1000,
  });
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
      ...(passed ? {} : { outputTail: output.slice(-10) }),
    },
    "specty",
  );
  return passed
    ? { ok: true, change: updated }
    : { ok: false, command, code: result.code, tail: output };
}

/** Marks the task done, ticks it in the spec and commits code and state together. */
async function complete(
  session: Session,
  change: StoredChange,
  spec: Spec,
  task: Task,
  summary: string,
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
  const updated = await commitState(session, change, { ...state, phase, tasks }, "task.completed", {
    task: task.id,
    summary,
  });
  const relativeDir = session.paths.relative(change.files.dir);
  const scope = moduleOf(task.files[0] ?? "");
  const subject = `${task.type ?? "feat"}${scope === "(root)" ? "" : `(${scope})`}: ${task.title}`;
  const commit = await commitWithReceipt(session, {
    subject,
    trailers: changeTrailers(session, state.id, {
      "Specty-Task": task.id,
      "Specty-Spec": `r${state.approved?.revision ?? state.revision}@${shortHash(state.approved?.hash ?? "")}`,
    }),
    stage: [[".", ":(exclude).specty"], [relativeDir]],
    receipt: { change: state.id, kind: "task", task: task.id },
  });
  return { ...updated, commit };
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
