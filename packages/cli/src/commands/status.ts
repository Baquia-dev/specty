// SPDX-License-Identifier: Apache-2.0
import {
  isIntegrating,
  type Output,
  parseSpec,
  phasePermissions,
  type StatusEntry,
  statusCard,
} from "@baquia-dev/specty-core";
import { resolveActive } from "../flow/active";
import type { Session } from "../session";
import { listOpenChanges, readSpec } from "../store/changes";

/** `specty status`: open changes, their phase and who they wait for. */
export async function status(session: Session): Promise<Output> {
  const current = await resolveActive(session);
  const changes = await listOpenChanges(session.paths);
  const entries = await Promise.all(
    changes.map(async (change): Promise<StatusEntry> => {
      const { state } = change;
      const title = parseSpec(await readSpec(change.files), { language: session.lang }).spec.title;
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
        current: current?.state.id === state.id,
        pendingScope: state.pending.scopeRequests.map((request) => request.id),
      };
    }),
  );
  return statusCard(entries, session.cards);
}
