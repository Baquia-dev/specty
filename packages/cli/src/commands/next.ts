// SPDX-License-Identifier: Apache-2.0
import {
  type Front,
  isGoverned,
  localDay,
  nextCard,
  type Output,
  parseSpec,
  sessionEntries,
  withDevPorts,
} from "@baquia-dev/specty-core";
import { toolExclusions } from "../detect/formatters";
import { conversationChange } from "../enforce/sessions";
import { commitState, resolveActive } from "../flow/active";
import { finishEpic } from "../flow/epic";
import { lostChanges } from "../flow/lost";
import { changeView } from "../flow/views";
import { entersByName } from "../install/agents";
import { freshProject } from "../install/product";
import { pathsOf } from "../io/git";
import type { Session } from "../session";
import { readSpec, type StoredChange } from "../store/changes";
import { liveHolds } from "../store/front-owners";
import { readMemory } from "../store/memory";
import { portsOf } from "../store/ports";
import { pendingIntegration } from "./integrate";
import { openChanges } from "./status";

/**
 * `specty next`: what to do now. In `implementing` it activates the next pending task, or moves an
 * epic whose slices are all closed to acceptance. An incorporation whose merge someone aborted is
 * forgotten, as `accept` and `close` do: nothing is left to resolve.
 */
export async function next(session: Session): Promise<Output> {
  const active = await resolveActive(session);
  if (active === undefined) {
    const byName = await entersByName(session.root);
    // A conversation that left its change's folder goes back there (`specty new`, `enter`).
    const own = await conversationChange(session);
    if (own !== undefined) return nextCard({ dirty: [], own, byName }, session.cards);
    const dirty = await dirtyGoverned(session);
    // Without code yet, the first change is the project's skeleton (ARCHITECTURE §14).
    const fresh = dirty.length === 0 && (await freshProject(session));
    // The memory goes to every session that starts with no change (ADR 0016), but for the
    // reminders that wait for their day or for the files of their paths.
    const { entries, fronts } = await readMemory(session.git, session.config.memory.branch);
    const memory = sessionEntries(entries, localDay(session.environment.now()));
    const view = fronts.length === 0 ? {} : { fronts: await frontsView(session, fronts) };
    // Specty doesn't edit the tools that see what it writes: the agent tells the user (ADR 0018).
    const exclusions = (await toolExclusions(session.root)).filter((tool) => !tool.excluded);
    const orphans = await orphanChanges(session);
    const lost = (await lostChanges(session)).map(({ id, title, state }) => ({
      id,
      title,
      phase: state.phase,
    }));
    const start = { memory, exclusions, orphans, lost, byName, ...view };
    return nextCard({ dirty, ...(fresh ? { fresh } : {}), ...start }, session.cards);
  }
  const pending = await pendingIntegration(session, active, "close");
  const current = pending.kind === "go" ? pending.change : active;
  const change =
    current.state.phase !== "implementing"
      ? current
      : current.state.kind === "epic"
        ? await finishEpic(session, current)
        : await activateNextTask(session, current);
  const card = nextCard({ change: await changeView(session, change), dirty: [] }, session.cards);
  // In a change's folder, the agent starts its development servers on that folder's ports.
  return withDevPorts(card, await portsOf(session, session.root), session.lang);
}

/** The open changes no conversation holds, as `status` tells its orphans, with their folders. */
async function orphanChanges(session: Session) {
  return (await openChanges(session))
    .filter((entry) => entry.orphan === true)
    .map(({ id, title, phase, folder }) => ({ id, title, phase, folder: folder ?? "." }));
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

/**
 * The memory's fronts for the card with no active change: who holds each while their conversation
 * keeps stepping (`memory.orphanAfterMin`), and the one the conversation that asks holds.
 */
async function frontsView(session: Session, fronts: readonly Front[]) {
  const { now } = session.environment;
  const live = await liveHolds(session.git, now(), session.config.memory.orphanAfterMin);
  const asker = session.conversation;
  const own = live.find((hold) => hold.tool === asker?.tool && hold.conversation === asker.id);
  return { fronts, owners: live, ...(own === undefined ? {} : { own: own.front }) };
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
