// SPDX-License-Identifier: Apache-2.0
import { realpath } from "node:fs/promises";
import type { SessionView } from "@baquia-dev/specty-core";
import { isFinished } from "../flow/active";
import { locateChanges } from "../flow/changes";
import { sessionTotals } from "../flow/usage";
import type { Session } from "../session";
import { type Activity, readActivity } from "../store/activity";
import { posixRelative } from "../store/paths";

const MINUTE_MS = 60_000;

/**
 * `GET /api/sessions` (ADR 0016): each agent conversation the guard noted, newest first, with the
 * folder of its last step relative to the main folder, the open change of that folder, whether it
 * stepped within `memory.orphanAfterMin`, and what Claude Code's sessions spent when ccusage tells.
 */
export async function sessionsView(session: Session): Promise<SessionView[]> {
  const activity = await readActivity(session.git);
  if (activity.length === 0) return [];
  const main = (await session.git.worktrees())[0]?.folder ?? session.root;
  const changes = await changeFolders(session);
  const claude = activity.some((step) => step.tool === "claude-code");
  const totals = claude ? await sessionTotals(session) : new Map();
  const now = session.environment.now().getTime();
  const limit = session.config.memory.orphanAfterMin * MINUTE_MS;
  const views = await Promise.all(
    activity.map(async (step): Promise<SessionView> => {
      const folder = await real(step.folder);
      const change = changes.get(folder);
      const usage = step.tool === "claude-code" ? totals.get(step.conversation) : undefined;
      return {
        tool: step.tool,
        conversation: step.conversation,
        folder: await relativeTo(main, step, folder),
        ...(change !== undefined ? { change } : {}),
        first: step.first,
        last: step.last,
        live: now - Date.parse(step.last) <= limit,
        ...(usage !== undefined ? { usage } : {}),
      };
    }),
  );
  return views.sort((a, b) => Date.parse(b.last) - Date.parse(a.last));
}

/** The open change of each folder, by its real path. */
async function changeFolders(session: Session): Promise<ReadonlyMap<string, string>> {
  const located = (await locateChanges(session)).filter(({ change }) => !isFinished(change.state));
  const pairs = await Promise.all(
    located.map(
      async ({ change, session: there }): Promise<[string, string]> => [
        await real(there.root),
        change.state.id,
      ],
    ),
  );
  return new Map(pairs);
}

/**
 * The step's folder relative to the main folder, as written or with links resolved: a folder that
 * no longer exists cannot be resolved. A folder outside the main one stays as it is.
 */
async function relativeTo(main: string, step: Activity, folder: string): Promise<string> {
  const options = [posixRelative(main, step.folder), posixRelative(await real(main), folder)];
  return options.find((option) => !option.startsWith("..")) ?? step.folder;
}

/** The real path of `folder`, or `folder` itself when it no longer exists. */
async function real(folder: string): Promise<string> {
  return realpath(folder).catch(() => folder);
}
