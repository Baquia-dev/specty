// SPDX-License-Identifier: Apache-2.0
// What the person's review does to a sample record, the way the local server does it: deciding
// an assumption, commenting on the spec, and approving it (or its tests, in testing).
import { ActionError, type ChangeRecord, type CommentAnchor, type CommentRecord } from "./records";
import { HASH, REVIEWER } from "./sample-records";
import { approveTestsIn } from "./sample-tests";

export function decideAssumptionIn(
  record: ChangeRecord,
  item: string,
  decision: "confirmed" | "rejected",
  comment?: string,
): ChangeRecord {
  return {
    ...record,
    state: {
      ...record.state,
      items: {
        ...record.state.items,
        [item]: { hash: HASH, decision, ...(comment ? { comment } : {}) },
      },
    },
  };
}

export function addCommentIn(
  record: ChangeRecord,
  anchor: CommentAnchor,
  body: string,
  now: number,
): ChangeRecord {
  const comments = record.comments ?? [];
  const comment: CommentRecord = {
    id: `c${comments.length + 1}`,
    revision: record.state.revision,
    anchor,
    author: REVIEWER,
    body,
    createdAt: new Date(now).toISOString(),
  };
  return { ...record, comments: [...comments, comment] };
}

export function editCommentIn(record: ChangeRecord, id: string, body: string): ChangeRecord {
  const comments = record.comments ?? [];
  const updated = comments.map((comment) => (comment.id === id ? { ...comment, body } : comment));
  return { ...record, comments: updated };
}

export function deleteCommentIn(record: ChangeRecord, id: string): ChangeRecord {
  const comments = record.comments ?? [];
  const filtered = comments.filter((comment) => comment.id !== id);
  return { ...record, comments: filtered };
}

/** Approving `revision`: only the one under review; in testing, the approval is the tests'. */
export function approveIn(record: ChangeRecord, revision: number, now: number): ChangeRecord {
  if (record.state.revision !== revision) {
    throw new ActionError({
      es: `La spec cambió: ahora es la revisión ${record.state.revision}. Revísala de nuevo.`,
      en: `The spec changed: it is now revision ${record.state.revision}. Review it again.`,
    });
  }
  // In testing, the approval is the tests' (the gate 2), as on the server.
  if (record.state.phase === "testing") return approveTestsIn(record, now, HASH);
  const at = new Date(now).toISOString();
  // Approving clears the review sent back, as on the server.
  const { changesRequestedAt: _requested, ...state } = record.state;
  return {
    ...record,
    phaseSince: at,
    state: {
      ...state,
      phase: "implementing",
      approved: { revision, hash: HASH, at, by: REVIEWER, channel: "ui" },
    },
  };
}
