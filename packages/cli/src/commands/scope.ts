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
  type UnlockRefusal,
  unlockRefusalCard,
  withLead,
} from "@baquia-dev/specty-core";
import { commitState, resolveActive } from "../flow/active";
import { listed, sharedBlock, sharedFiles } from "../flow/shared";
import { type UnlockOptions, type UnlockProposal, unlockProposal } from "../flow/unlock-proposal";
import { changeView } from "../flow/views";
import type { Session } from "../session";
import { readSpec, type StoredChange } from "../store/changes";

/** The task a scope request is for: the one `--task` names, or the active one; upper case. */
function requestedTask(state: ChangeState, option: string | undefined): string {
  const active = Object.entries(state.tasks).find(([, task]) => task.status === "active")?.[0];
  return (option ?? active ?? "").toUpperCase();
}

/** What `specty scope add` gives besides its paths: why, for which task, and an unlock's options. */
export interface ScopeAsk extends UnlockOptions {
  readonly reason: string;
  readonly task: string | undefined;
}

/** `specty scope add`: extends the active task's scope, by policy or on a person's approval. */
export async function scopeAdd(
  session: Session,
  rawPaths: readonly string[],
  ask: ScopeAsk,
): Promise<Output> {
  const { cards } = session;
  const active = await resolveActive(session);
  if (active === undefined || active.state.phase !== "implementing") {
    return scopeAddRefusalCard({ reason: "not-implementing" }, headerOf(), cards);
  }
  const { state } = active;
  const header = headerOf(state.id, "implementing");
  const taskId = requestedTask(state, ask.task);
  const stored = state.tasks[taskId];
  if (stored?.status !== "active") {
    return scopeAddRefusalCard({ reason: "not-active", task: taskId }, header, cards);
  }
  const paths = rawPaths.map(normalizePath);
  const refusal = requestRefusal(paths, ask.reason, taskId);
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
  const unlock = await unlockOf(session, state, locked, ask);
  if (!unlock.ok) return unlockRefusalCard(unlock.refusal, { task: taskId, paths }, header, cards);
  if (missing.length === 0) {
    return withLead(
      inScopeLead(cards),
      nextCard({ change: await changeView(session, active), dirty: [] }, cards),
    );
  }
  const wanted: Wanted = { task: taskId, paths: missing, reason: ask.reason.trim() };
  // The change's scope: what the approved spec lists in Files, both sides of each rename.
  const planned = listed(spec);
  // Requested files another open change also lists, shown whatever the decision.
  const shared = sharedBlock(session, await sharedFiles(session, state.id, missing));
  // Unlocking an approved test is never approved by policy (ADR 0014).
  const card =
    locked.length === 0 && decideScopeRequest(missing, rules, planned) === "auto"
      ? await approveByPolicy(session, active, spec, wanted, planned)
      : await requestApproval(session, active, header, wanted, unlock.proposal);
  return { ...card, blocks: [...card.blocks, ...shared] };
}

/**
 * The unlock a request asks for: the patch and the evidence of its `locked` tests, none without
 * them, or why not. `--patch` and `--evidence` only explain an unlock (ADR 0014).
 */
async function unlockOf(
  session: Session,
  state: ChangeState,
  locked: readonly string[],
  ask: ScopeAsk,
): Promise<
  | { readonly ok: true; readonly proposal: UnlockProposal | undefined }
  | { readonly ok: false; readonly refusal: UnlockRefusal }
> {
  if (locked.length > 0) return unlockProposal(session, state, locked, ask);
  return ask.patch === undefined && ask.evidence.length === 0
    ? { ok: true, proposal: undefined }
    : { ok: false, refusal: { reason: "not-unlock" } };
}

/**
 * What the task asks for: the paths outside its scope and, though inside it, the approved tests
 * (`locked`), whose unlock is a request too; also one already unlocked for it, whose new patch
 * replaces the earlier one (ADR 0014).
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
  const locked = paths.filter((path) => Object.hasOwn(state.lockedTests ?? {}, path));
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
 * A request the person decides on, numbered after the change's last one. One that unlocks an
 * approved test, with its `unlock` patch and evidence, is the person's alone.
 */
async function requestApproval(
  session: Session,
  active: StoredChange,
  header: string,
  wanted: Wanted,
  unlock: UnlockProposal | undefined,
): Promise<Output> {
  const { state } = active;
  const number = (state.maxIds.S ?? 0) + 1;
  const request = {
    id: `S${number}`,
    task: wanted.task,
    paths: [...wanted.paths],
    reason: wanted.reason,
    ...(unlock === undefined ? {} : { patch: unlock.patch, evidence: [...unlock.evidence] }),
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
  return scopeRequestedCard(header, request.id, wanted.paths, session.cards, unlock !== undefined);
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
