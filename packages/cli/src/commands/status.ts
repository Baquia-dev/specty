// SPDX-License-Identifier: Apache-2.0
import { realpath, stat } from "node:fs/promises";
import {
  isIntegrating,
  type Output,
  parseSpec,
  phasePermissions,
  type StatusEntry,
  statusCard,
} from "@baquia-dev/specty-core";
import { isFinished } from "../flow/active";
import { locateChanges } from "../flow/changes";
import type { Session } from "../session";
import { type Activity, readActivity } from "../store/activity";
import { readSpec, type StoredChange } from "../store/changes";
import { posixRelative } from "../store/paths";

const MINUTE_MS = 60_000;

/** `specty status`: the open changes of every worktree, their phase and who they wait for. */
export async function status(session: Session): Promise<Output> {
  const located = (await locateChanges(session)).filter(({ change }) => !isFinished(change.state));
  const steps = await stepsByFolder(session);
  const entries = await Promise.all(
    located.map(async ({ change, session: there, current }): Promise<StatusEntry> => {
      const { state } = change;
      const title = parseSpec(await readSpec(change.files), { language: there.lang }).spec.title;
      const folder = posixRelative(session.root, there.root);
      const waitingFor =
        state.pending.scopeRequests.length > 0
          ? "human"
          : phasePermissions(
              state.phase,
              (state.phase === "testing" ? state.testsSubmittedAt : state.closingSubmittedAt) !==
                undefined,
              isIntegrating(state),
            ).waitingFor;
      return {
        id: state.id,
        kind: state.kind,
        phase: state.phase,
        title,
        waitingFor,
        current,
        pendingScope: state.pending.scopeRequests.map((request) => request.id),
        ...(folder.length > 0 ? { folder } : {}),
        ...(await holding(session, change, steps.get(await real(there.root)), waitingFor)),
      };
    }),
  );
  return statusCard(entries, session.cards);
}

/** The last step noted in each folder, by its real path. */
async function stepsByFolder(session: Session): Promise<ReadonlyMap<string, Activity>> {
  const last = new Map<string, Activity>();
  for (const activity of await readActivity(session.git)) {
    const folder = await real(activity.folder);
    const known = last.get(folder);
    if (known === undefined || Date.parse(activity.last) > Date.parse(known.last))
      last.set(folder, activity);
  }
  return last;
}

/**
 * Who holds the change: the agent of the last step in its folder, and how many minutes ago. An
 * orphan waits for the agent, and neither a step nor a write to its state happened lately
 * (`memory.orphanAfterMin`, ADR 0016).
 */
async function holding(
  session: Session,
  change: StoredChange,
  step: Activity | undefined,
  waitingFor: StatusEntry["waitingFor"],
): Promise<Pick<StatusEntry, "holder" | "orphan">> {
  const now = session.environment.now().getTime();
  const limit = session.config.memory.orphanAfterMin * MINUTE_MS;
  const holder =
    step === undefined
      ? undefined
      : {
          tool: step.tool,
          ago: Math.max(0, Math.floor((now - Date.parse(step.last)) / MINUTE_MS)),
        };
  const held = holder === undefined ? {} : { holder };
  if (waitingFor !== "agent") return held;
  if (step !== undefined && now - Date.parse(step.last) <= limit) return held;
  const written = (await stat(change.files.state).catch(() => undefined))?.mtimeMs;
  return written !== undefined && now - written <= limit ? held : { ...held, orphan: true };
}

/** The real path of `folder`, or `folder` itself when it no longer exists. */
async function real(folder: string): Promise<string> {
  return realpath(folder).catch(() => folder);
}
