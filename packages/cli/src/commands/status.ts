// SPDX-License-Identifier: Apache-2.0
import { realpath, stat } from "node:fs/promises";
import {
  changeWaitsFor,
  localDay,
  type Output,
  parseSpec,
  type StatusEntry,
  sessionEntries,
  statusCard,
} from "@baquia-dev/specty-core";
import { isFinished } from "../flow/active";
import { locateChanges } from "../flow/changes";
import { lostChanges } from "../flow/lost";
import { countOrphans } from "../flow/orphans";
import type { Session } from "../session";
import { type Activity, readActivity } from "../store/activity";
import { readSpec, type StoredChange } from "../store/changes";
import { liveHolds } from "../store/front-owners";
import { readBindings } from "../store/local";
import { readMemory } from "../store/memory";
import { anyMessages, waitingCount } from "../store/messages";
import { posixRelative } from "../store/paths";

const MINUTE_MS = 60_000;

/**
 * `specty status`: the open changes of every worktree, their phase and who they wait for, the
 * memory's fronts with who holds each in «FRENTES», its open reminders in «TE TOCA» (ADR 0016),
 * and how many orphans `specty prune` would remove in «LIMPIEZA».
 */
export async function status(session: Session): Promise<Output> {
  const open = await openChanges(session);
  const known = new Set(open.map((entry) => entry.id));
  const lost = (await lostEntries(session)).filter((entry) => !known.has(entry.id));
  const entries = [...open, ...lost];
  const memory = await readMemory(session.git, session.config.memory.branch);
  const now = session.environment.now();
  const owners =
    memory.fronts.length === 0
      ? []
      : await liveHolds(session.git, now, session.config.memory.orphanAfterMin);
  const reminders = sessionEntries(memory.entries, localDay(now));
  const orphans = Object.values(await countOrphans(session)).reduce((sum, count) => sum + count);
  const fronts = { fronts: memory.fronts, owners };
  return statusCard(entries, session.cards, reminders, fronts, orphans);
}

/** The open changes whose folder is gone, read from their branches (`lost`). */
async function lostEntries(session: Session): Promise<StatusEntry[]> {
  return (await lostChanges(session)).map(({ id, state, title }) => ({
    id,
    kind: state.kind,
    phase: state.phase,
    title,
    waitingFor: changeWaitsFor(state),
    current: false,
    pendingScope: state.pending.scopeRequests.map((request) => request.id),
    lost: true,
  }));
}

/** The open changes of every worktree as `status` shows them: phase, who they wait for and who holds them. */
export async function openChanges(session: Session): Promise<StatusEntry[]> {
  const located = (await locateChanges(session)).filter(({ change }) => !isFinished(change.state));
  const activity = await readActivity(session.git);
  const steps = await stepsByFolder(activity);
  const away = await awayByFolder(session, activity);
  // Only when some message waits does it look at each change's folder of messages.
  const counting = await anyMessages(session.git);
  return Promise.all(
    located.map(async ({ change, session: there, current }): Promise<StatusEntry> => {
      const { state } = change;
      const root = await real(there.root);
      const title = parseSpec(await readSpec(change.files), { language: there.lang }).spec.title;
      const folder = posixRelative(session.root, there.root);
      const waitingFor = changeWaitsFor(state);
      return {
        id: state.id,
        kind: state.kind,
        phase: state.phase,
        title,
        waitingFor,
        current,
        pendingScope: state.pending.scopeRequests.map((request) => request.id),
        ...(folder.length > 0 ? { folder } : {}),
        ...(await holding(session, change, waitingFor, {
          step: steps.get(root),
          away: away.get(root),
        })),
        ...(counting ? await waiting(session, state.id) : {}),
      };
    }),
  );
}

/** The messages waiting for the session of change `id`, when there are any. */
async function waiting(session: Session, id: string): Promise<Pick<StatusEntry, "messages">> {
  const messages = await waitingCount(session.git, id);
  return messages > 0 ? { messages } : {};
}

/** The last step noted in each folder, by its real path. */
async function stepsByFolder(steps: readonly Activity[]): Promise<ReadonlyMap<string, Activity>> {
  const last = new Map<string, Activity>();
  for (const activity of steps) {
    const folder = await real(activity.folder);
    const known = last.get(folder);
    if (known === undefined || Date.parse(activity.last) > Date.parse(known.last))
      last.set(folder, activity);
  }
  return last;
}

/**
 * By the real path of each folder a conversation is bound to (`sessions/`), the bound
 * conversation that stepped last in another folder within `memory.orphanAfterMin` minutes: its
 * agent, and how many minutes ago. With several, the one that stepped last.
 */
async function awayByFolder(
  session: Session,
  steps: readonly (Activity & { readonly conversation: string })[],
): Promise<ReadonlyMap<string, NonNullable<StatusEntry["away"]>>> {
  const now = session.environment.now().getTime();
  const limit = session.config.memory.orphanAfterMin * MINUTE_MS;
  const byConversation = new Map(steps.map((step) => [step.conversation, step]));
  const away = new Map<string, Activity>();
  for (const binding of await readBindings(session.git)) {
    const step = byConversation.get(binding.conversation);
    if (step === undefined || now - Date.parse(step.last) > limit) continue;
    const folder = await real(binding.folder);
    if ((await real(step.folder)) === folder) continue;
    const known = away.get(folder);
    if (known === undefined || Date.parse(step.last) > Date.parse(known.last))
      away.set(folder, step);
  }
  return new Map(
    [...away].map(([folder, step]) => [
      folder,
      { tool: step.tool, ago: minutesAgo(now, step.last) },
    ]),
  );
}

/**
 * Who holds the change: the agent of the last step in its folder, and how many minutes ago. An
 * orphan waits for the agent, and neither a step nor a write to its state happened lately
 * (`memory.orphanAfterMin`, ADR 0016). One that waits for the agent with nobody stepping in its
 * folder lately is away when its conversation stepped last in another folder (`awayByFolder`).
 */
async function holding(
  session: Session,
  change: StoredChange,
  waitingFor: StatusEntry["waitingFor"],
  seen: { readonly step: Activity | undefined; readonly away: StatusEntry["away"] },
): Promise<Pick<StatusEntry, "holder" | "orphan" | "away">> {
  const { step } = seen;
  const now = session.environment.now().getTime();
  const limit = session.config.memory.orphanAfterMin * MINUTE_MS;
  const held =
    step === undefined ? {} : { holder: { tool: step.tool, ago: minutesAgo(now, step.last) } };
  if (waitingFor !== "agent") return held;
  if (step !== undefined && now - Date.parse(step.last) <= limit) return held;
  const out = seen.away === undefined ? held : { ...held, away: seen.away };
  const written = (await stat(change.files.state).catch(() => undefined))?.mtimeMs;
  return written !== undefined && now - written <= limit ? out : { ...out, orphan: true };
}

/** Whole minutes from `at` (ISO 8601) to `now`, never fewer than none. */
function minutesAgo(now: number, at: string): number {
  return Math.max(0, Math.floor((now - Date.parse(at)) / MINUTE_MS));
}

/** The real path of `folder`, or `folder` itself when it no longer exists. */
async function real(folder: string): Promise<string> {
  return realpath(folder).catch(() => folder);
}
