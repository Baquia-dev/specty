// SPDX-License-Identifier: Apache-2.0
import {
  autoApprovedLead,
  autoBasis,
  type ChangeState,
  classifyPath,
  decideScopeRequest,
  headerOf,
  inScopeLead,
  matchesAny,
  nextCard,
  normalizePath,
  type Output,
  parseSpec,
  pathProblem,
  scopeAddRefusalCard,
  scopeRequestedCard,
  scopeRulesFrom,
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
  const { cards } = session;
  const active = await resolveActive(session);
  if (active === undefined || active.state.phase !== "implementing") {
    return scopeAddRefusalCard({ reason: "not-implementing" }, headerOf(), cards);
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
    return scopeAddRefusalCard({ reason: "not-active", task: taskId }, header, cards);
  }
  const paths = rawPaths.map(normalizePath);
  const invalid = paths.filter((path) => pathProblem(path) !== undefined);
  if (invalid.length > 0) {
    return scopeAddRefusalCard(
      { reason: "invalid-paths", paths: invalid, task: taskId },
      header,
      cards,
    );
  }
  if (paths.length === 0 || reason.trim().length === 0) {
    return scopeAddRefusalCard({ reason: "incomplete", task: taskId }, header, cards);
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
      inScopeLead(cards),
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
    const approved = decided.map((entry) => ({
      path: entry.path,
      planned: entry.basis === "planned",
      tasks: entry.tasks,
    }));
    const card = withLead(
      autoApprovedLead(approved, cards),
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
