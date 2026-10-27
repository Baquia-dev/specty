// SPDX-License-Identifier: Apache-2.0
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
import { readSpec } from "../store/changes";
import { posixRelative } from "../store/paths";

/** `specty status`: the open changes of every worktree, their phase and who they wait for. */
export async function status(session: Session): Promise<Output> {
  const located = (await locateChanges(session)).filter(({ change }) => !isFinished(change.state));
  const entries = await Promise.all(
    located.map(async ({ change, session: there, current }): Promise<StatusEntry> => {
      const { state } = change;
      const title = parseSpec(await readSpec(change.files), { language: there.lang }).spec.title;
      const folder = posixRelative(session.root, there.root);
      return {
        id: state.id,
        kind: state.kind,
        phase: state.phase,
        title,
        waitingFor:
          state.pending.scopeRequests.length > 0
            ? "human"
            : phasePermissions(
                state.phase,
                state.closingSubmittedAt !== undefined,
                isIntegrating(state),
              ).waitingFor,
        current,
        pendingScope: state.pending.scopeRequests.map((request) => request.id),
        ...(folder.length > 0 ? { folder } : {}),
      };
    }),
  );
  return statusCard(entries, session.cards);
}
