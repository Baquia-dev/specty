// SPDX-License-Identifier: Apache-2.0
import { isGoverned, nextCard, type Output, parseSpec } from "@baquia-dev/specty-core";
import { commitState, resolveActive } from "../flow/active";
import { finishEpic } from "../flow/epic";
import { changeView } from "../flow/views";
import { freshProject } from "../install/product";
import { pathsOf } from "../io/git";
import type { Session } from "../session";
import { readSpec, type StoredChange } from "../store/changes";

/**
 * `specty next`: what to do now. In `implementing` it activates the next pending task, or moves an
 * epic whose slices are all closed to acceptance.
 */
export async function next(session: Session): Promise<Output> {
  const active = await resolveActive(session);
  if (active === undefined) {
    const dirty = await dirtyGoverned(session);
    // Without code yet, the first change is the project's skeleton (ARCHITECTURE §14).
    const fresh = dirty.length === 0 && (await freshProject(session));
    return nextCard({ dirty, ...(fresh ? { fresh } : {}) }, session.cards);
  }
  const change =
    active.state.phase !== "implementing"
      ? active
      : active.state.kind === "epic"
        ? await finishEpic(session, active)
        : await activateNextTask(session, active);
  return nextCard({ change: await changeView(session, change), dirty: [] }, session.cards);
}

/**
 * A person's decision that the agent takes in delegated mode, and what comes after it at once:
 * the decision's lines, then what `next` says, so no `next` is needed only to bring the card. A
 * person's own decision, or one that did not go through, stays as it is.
 */
export async function thenNext(session: Session, decided: Output): Promise<Output> {
  if (session.actor !== "agent" || decided.status !== "ok") return decided;
  const card = await next(session);
  return { ...card, blocks: [...decided.blocks, ...card.blocks] };
}

/** Marks the first pending task as active, unless one already is. */
export async function activateNextTask(
  session: Session,
  change: StoredChange,
): Promise<StoredChange> {
  const { state } = change;
  if (Object.values(state.tasks).some((task) => task.status === "active")) return change;
  const spec = parseSpec(await readSpec(change.files), { language: session.lang }).spec;
  const pending = (spec.sections.tasks?.items ?? []).find(
    (task) => state.tasks[task.id]?.status !== "done",
  );
  if (pending === undefined) return change;
  const head = await session.git.head();
  const previous = state.tasks[pending.id];
  const startedAt = session.environment.now().toISOString();
  return commitState(
    session,
    change,
    {
      ...state,
      tasks: {
        ...state.tasks,
        [pending.id]: {
          status: "active",
          attempts: previous?.attempts ?? 0,
          scopeExtra: previous?.scopeExtra ?? [],
          startedAt,
          ...(head !== undefined ? { baseCommit: head } : {}),
        },
      },
    },
    "task.started",
    { task: pending.id, ...(head !== undefined ? { baseCommit: head } : {}) },
  );
}

/** Governed paths changed in the working tree, outside Specty's own directory. */
export async function dirtyGoverned(session: Session): Promise<string[]> {
  const changed = pathsOf(await session.git.changedSince(await session.git.head()));
  return changed.filter((path) => !path.startsWith(".specty/") && isGoverned(path, session.config));
}
