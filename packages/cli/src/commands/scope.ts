// SPDX-License-Identifier: Apache-2.0
import {
  autoBasis,
  blockedCard,
  type ChangeState,
  classifyPath,
  decideScopeRequest,
  headerOf,
  matchesAny,
  nextCard,
  normalizePath,
  type Output,
  parseSpec,
  pathProblem,
  scopeRequestedCard,
  scopeRulesFrom,
  translator,
  withLead,
} from "@baquia-dev/specty-core";
import { commitState, resolveActive } from "../flow/active";
import { listed, sharedBlock, sharedFiles } from "../flow/shared";
import { changeView } from "../flow/views";
import type { Session } from "../session";
import { readSpec } from "../store/changes";

/** `specty scope add`: extends the active task's scope, by policy or on a person's approval. */
export async function scopeAdd(
  session: Session,
  rawPaths: readonly string[],
  reason: string,
  taskOption: string | undefined,
): Promise<Output> {
  const t = translator(session.lang);
  const { cards } = session;
  const nextStep = t(`ejecuta \`${cards.command} next\`.`, `run \`${cards.command} next\`.`);
  const active = await resolveActive(session);
  if (active === undefined || active.state.phase !== "implementing") {
    return blockedCard(
      headerOf(),
      t(
        "Solo se amplía el alcance durante la implementación.",
        "Scope is only extended during implementation.",
      ),
      nextStep,
    );
  }
  const { state } = active;
  const header = headerOf(state.id, "implementing");
  const taskId = (
    taskOption ??
    Object.entries(state.tasks).find(([, task]) => task.status === "active")?.[0] ??
    ""
  ).toUpperCase();
  const stored = state.tasks[taskId];
  if (stored?.status !== "active") {
    return blockedCard(
      header,
      t(`${taskId || "La tarea"} no está activa.`, `${taskId || "The task"} is not active.`),
      nextStep,
    );
  }
  const paths = rawPaths.map(normalizePath);
  const invalid = paths.filter((path) => pathProblem(path) !== undefined);
  if (invalid.length > 0 || paths.length === 0 || reason.trim().length === 0) {
    return {
      ...blockedCard(
        header,
        invalid.length > 0
          ? t(`Rutas no válidas: ${invalid.join(", ")}.`, `Invalid paths: ${invalid.join(", ")}.`)
          : t(
              "Indica al menos una ruta y el motivo (--reason).",
              "Give at least one path and the reason (--reason).",
            ),
        t(
          `ejecuta \`${cards.command} scope add <ruta> --task ${taskId} --reason "<motivo>"\`.`,
          `run \`${cards.command} scope add <path> --task ${taskId} --reason "<reason>"\`.`,
        ),
      ),
      status: "invalid",
    };
  }
  const spec = parseSpec(await readSpec(active.files), { language: session.lang }).spec;
  const task = spec.sections.tasks?.items.find((item) => item.id === taskId);
  const rules = scopeRulesFrom(session.config);
  const missing = paths.filter(
    (path) =>
      classifyPath(path, { taskFiles: task?.files ?? [], extras: stored.scopeExtra, rules }) ===
      "out-of-scope",
  );
  if (missing.length === 0) {
    return withLead(
      t("Esas rutas ya están dentro del alcance.", "Those paths are already within the scope."),
      nextCard({ change: await changeView(session, active), dirty: [] }, cards),
    );
  }
  // The change's scope: what the approved spec lists in Files, both sides of each rename.
  const planned = listed(spec);
  // Requested files another open change also lists, shown whatever the decision.
  const shared = sharedBlock(session, await sharedFiles(session, state.id, missing));
  if (decideScopeRequest(missing, rules, planned) === "auto") {
    const decided = missing.map((path) => ({
      path,
      basis: autoBasis(path, rules, planned),
      tasks: (spec.sections.tasks?.items ?? [])
        .filter((item) => item.id !== taskId && matchesAny(path, item.files))
        .map((item) => item.id),
    }));
    const foreseen = decided.filter((entry) => entry.basis === "planned");
    const updated = await commitState(
      session,
      active,
      withExtras(state, taskId, missing),
      "scope.decided",
      {
        task: taskId,
        paths: missing,
        reason: reason.trim(),
        decision: "auto",
        basis: Object.fromEntries(decided.map((entry) => [entry.path, entry.basis])),
        plannedFor: Object.fromEntries(foreseen.map((entry) => [entry.path, entry.tasks])),
      },
      "specty",
    );
    const described = decided.map((entry) => {
      if (entry.basis !== "planned") return entry.path;
      const tasks = entry.tasks.join(", ");
      return entry.tasks.length === 0
        ? t(`${entry.path} (ya en Archivos)`, `${entry.path} (already in Files)`)
        : t(
            `${entry.path} (ya en Archivos, prevista para ${tasks})`,
            `${entry.path} (already in Files, planned for ${tasks})`,
          );
    });
    const card = withLead(
      t(
        `Ampliación aprobada por la política: ${described.join(", ")}.`,
        `Extension approved by policy: ${described.join(", ")}.`,
      ),
      nextCard({ change: await changeView(session, updated), dirty: [] }, cards),
    );
    return { ...card, blocks: [...card.blocks, ...shared] };
  }
  const number = (state.maxIds.S ?? 0) + 1;
  const request = { id: `S${number}`, task: taskId, paths: missing, reason: reason.trim() };
  await commitState(
    session,
    active,
    {
      ...state,
      maxIds: { ...state.maxIds, S: number },
      pending: { ...state.pending, scopeRequests: [...state.pending.scopeRequests, request] },
    },
    "scope.requested",
    request,
  );
  const card = scopeRequestedCard(header, request.id, missing, cards);
  return { ...card, blocks: [...card.blocks, ...shared] };
}

export function withExtras(
  state: ChangeState,
  taskId: string,
  paths: readonly string[],
): ChangeState {
  const stored = state.tasks[taskId];
  if (stored === undefined) return state;
  const scopeExtra = [...new Set([...stored.scopeExtra, ...paths])];
  return { ...state, tasks: { ...state.tasks, [taskId]: { ...stored, scopeExtra } } };
}
