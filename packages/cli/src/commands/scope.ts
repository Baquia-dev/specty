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
  type ScopeAddRefusal,
  type ScopeRules,
  type Spec,
  scopeAddRefusalCard,
  scopeRequestedCard,
  scopeRulesFrom,
  withLead,
} from "@baquia-dev/specty-core";
import { commitState, resolveActive } from "../flow/active";
import { listed, sharedBlock, sharedFiles } from "../flow/shared";
import { changeView } from "../flow/views";
import type { Session } from "../session";
import { readSpec, type StoredChange } from "../store/changes";

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
  const refusal = requestRefusal(paths, reason, taskId);
  if (refusal !== undefined) return scopeAddRefusalCard(refusal, header, cards);
  const spec = parseSpec(await readSpec(active.files), { language: session.lang }).spec;
  const task = spec.sections.tasks?.items.find((item) => item.id === taskId);
  const rules = scopeRulesFrom(session.config);
  const { missing, locked } = askedFor(
    paths,
    task?.files ?? [],
    stored.scopeExtra,
    active.state,
    rules,
  );
  if (missing.length === 0) {
    return withLead(
      inScopeLead(cards),
      nextCard({ change: await changeView(session, active), dirty: [] }, cards),
    );
  }
  const wanted: Wanted = { task: taskId, paths: missing, reason: reason.trim() };
  // The change's scope: what the approved spec lists in Files, both sides of each rename.
  const planned = listed(spec);
  // Requested files another open change also lists, shown whatever the decision.
  const shared = sharedBlock(session, await sharedFiles(session, state.id, missing));
  // Unlocking an approved test is never approved by policy (ADR 0014).
  const card =
    locked.length === 0 && decideScopeRequest(missing, rules, planned) === "auto"
      ? await approveByPolicy(session, active, spec, wanted, planned)
      : await requestApproval(session, active, header, wanted, locked.length > 0);
  return { ...card, blocks: [...card.blocks, ...shared] };
}

/**
 * What the task asks for: the paths outside its scope and, though inside it, the approved tests
 * still locked for it (`locked`), whose unlock is a request too.
 */
function askedFor(
  paths: readonly string[],
  taskFiles: readonly string[],
  extras: readonly string[],
  state: ChangeState,
  rules: ScopeRules,
): { readonly missing: readonly string[]; readonly locked: readonly string[] } {
  const outside = paths.filter(
    (path) => classifyPath(path, { taskFiles, extras, rules }) === "out-of-scope",
  );
  const locked = paths.filter(
    (path) => Object.hasOwn(state.lockedTests ?? {}, path) && !extras.includes(path),
  );
  return { missing: [...new Set([...outside, ...locked])], locked };
}

/** The paths a task asks for, outside its scope, and why. */
interface Wanted {
  readonly task: string;
  readonly paths: readonly string[];
  readonly reason: string;
}

/** Paths that are not valid ones, or a request without paths or a reason. */
function requestRefusal(
  paths: readonly string[],
  reason: string,
  task: string,
): ScopeAddRefusal | undefined {
  const invalid = paths.filter((path) => pathProblem(path) !== undefined);
  if (invalid.length > 0) return { reason: "invalid-paths", paths: invalid, task };
  if (paths.length === 0 || reason.trim().length === 0) return { reason: "incomplete", task };
  return undefined;
}

/** The policy approves the paths: each with why it qualifies and the other tasks that plan it. */
async function approveByPolicy(
  session: Session,
  active: StoredChange,
  spec: Spec,
  wanted: Wanted,
  planned: readonly string[],
): Promise<Output> {
  const rules = scopeRulesFrom(session.config);
  const decided = wanted.paths.map((path) => ({
    path,
    basis: autoBasis(path, rules, planned),
    tasks: (spec.sections.tasks?.items ?? [])
      .filter((item) => item.id !== wanted.task && matchesAny(path, item.files))
      .map((item) => item.id),
  }));
  const foreseen = decided.filter((entry) => entry.basis === "planned");
  const updated = await commitState(
    session,
    active,
    withExtras(active.state, wanted.task, wanted.paths),
    "scope.decided",
    {
      task: wanted.task,
      paths: wanted.paths,
      reason: wanted.reason,
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
  return withLead(
    autoApprovedLead(approved, session.cards),
    nextCard({ change: await changeView(session, updated), dirty: [] }, session.cards),
  );
}

/**
 * A request the person decides on, numbered after the change's last one. One that `unlocks` an
 * approved test is the person's alone.
 */
async function requestApproval(
  session: Session,
  active: StoredChange,
  header: string,
  wanted: Wanted,
  unlocks: boolean,
): Promise<Output> {
  const { state } = active;
  const number = (state.maxIds.S ?? 0) + 1;
  const request = {
    id: `S${number}`,
    task: wanted.task,
    paths: [...wanted.paths],
    reason: wanted.reason,
  };
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
  return scopeRequestedCard(header, request.id, wanted.paths, session.cards, unlocks);
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
