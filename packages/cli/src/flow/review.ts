// SPDX-License-Identifier: Apache-2.0
import {
  assumptionDecidedLine,
  blockedCard,
  changesRequestedLine,
  commentSavedLine,
  decisionCard,
  emptyCommentCard,
  headerOf,
  noAssumptionCard,
  nothingPendingCard,
  nothingToRequestCard,
  type Output,
  reloadNext,
  runNext,
  transition,
} from "@baquia-dev/specty-core";
import type { Lang } from "@baquia-dev/specty-core/light";
import type { Session } from "../session";
import type { StoredChange } from "../store/changes";
import { type CommentAnchor, readComments, writeComments } from "../store/comments";
import { commitState } from "./active";

const tr = (lang: Lang, es: string, en: string): string => (lang === "es" ? es : en);

const ASSUMPTION = /^A[1-9]\d*$/;

/**
 * A person decides one assumption during the review, as the UI asks it: confirmed, or rejected
 * with the reason the agent reads. At the terminal, `approve` asks them all at once.
 */
export async function decideAssumption(
  session: Session,
  change: StoredChange,
  item: string,
  decision: "confirmed" | "rejected",
  comment: string | undefined,
): Promise<Output> {
  const { state } = change;
  if (state.phase !== "review")
    return nothingPendingCard(state.id, state.phase, "approve", session.cards);
  const header = headerOf(state.id, "review");
  const current = ASSUMPTION.test(item) ? state.items[item] : undefined;
  if (current === undefined) return noAssumptionCard(item, header, session.cards);
  const reason = decision === "rejected" ? comment?.trim() || undefined : undefined;
  await commitState(
    session,
    change,
    {
      ...state,
      items: {
        ...state.items,
        [item]: {
          hash: current.hash,
          decision,
          ...(reason === undefined ? {} : { comment: reason }),
        },
      },
    },
    "assumption.decided",
    { item, decision, ...(reason === undefined ? {} : { comment: reason }) },
    "human",
  );
  return decisionCard(header, [assumptionDecidedLine(item, decision, session.lang)], session.cards);
}

/**
 * A person comments on the spec during the review, as the UI asks (formats.md §5). The agent
 * reads the comment once the person asks for the changes.
 */
export async function addComment(
  session: Session,
  change: StoredChange,
  anchor: CommentAnchor,
  body: string,
): Promise<Output> {
  const { state } = change;
  if (state.phase !== "review")
    return nothingPendingCard(state.id, state.phase, "approve", session.cards);
  const header = headerOf(state.id, "review");
  const text = body.trim();
  if (text === "") return emptyCommentCard(header, session.cards);
  const comments = await readComments(change.files);
  const id = `c${comments.length + 1}`;
  await writeComments(change.files, [
    ...comments,
    {
      id,
      revision: state.revision,
      anchor,
      author: (await session.git.config("user.name")) ?? "unknown",
      body: text,
      createdAt: session.environment.now().toISOString(),
    },
  ]);
  return decisionCard(header, [commentSavedLine(id, session.lang)], session.cards);
}

/** Updates the body of an existing comment on the spec. */
export async function editComment(
  session: Session,
  change: StoredChange,
  id: string,
  body: string,
): Promise<Output> {
  const { state } = change;
  if (state.phase !== "review")
    return nothingPendingCard(state.id, state.phase, "approve", session.cards);
  const header = headerOf(state.id, "review");
  const text = body.trim();
  if (text === "") return emptyCommentCard(header, session.cards);
  const comments = await readComments(change.files);
  const target = comments.find((comment) => comment.id === id);
  if (target === undefined) {
    return blockedCard(
      header,
      tr(session.lang, "El comentario no existe.", "The comment does not exist."),
      runNext(session.cards),
    );
  }
  await writeComments(
    change.files,
    comments.map((comment) => (comment.id === id ? { ...comment, body: text } : comment)),
  );
  return decisionCard(header, [commentSavedLine(id, session.lang)], session.cards);
}

/** Deletes a comment from the spec. */
export async function deleteComment(
  session: Session,
  change: StoredChange,
  id: string,
): Promise<Output> {
  const { state } = change;
  if (state.phase !== "review")
    return nothingPendingCard(state.id, state.phase, "approve", session.cards);
  const header = headerOf(state.id, "review");
  const comments = await readComments(change.files);
  const target = comments.find((comment) => comment.id === id);
  if (target === undefined) {
    return blockedCard(
      header,
      tr(session.lang, "El comentario no existe.", "The comment does not exist."),
      runNext(session.cards),
    );
  }
  await writeComments(
    change.files,
    comments.filter((comment) => comment.id !== id),
  );
  return decisionCard(
    header,
    [tr(session.lang, `Comentario ${id} eliminado.`, `Comment ${id} deleted.`)],
    session.cards,
  );
}

/**
 * The person asks the agent for changes: its unresolved comments and rejected assumptions,
 * which `specty next` shows it. The change stays in review.
 */
export async function requestChanges(session: Session, change: StoredChange): Promise<Output> {
  const { state } = change;
  if (state.phase !== "review")
    return nothingPendingCard(state.id, state.phase, "approve", session.cards);
  const header = headerOf(state.id, "review");
  const open = (await readComments(change.files))
    .filter((comment) => comment.resolvedInRevision === undefined)
    .map((comment) => comment.id);
  const rejected = Object.entries(state.items)
    .filter(([, item]) => item.decision === "rejected")
    .map(([id]) => id);
  if (open.length === 0 && rejected.length === 0)
    return nothingToRequestCard(header, session.cards);
  const moved = transition({
    phase: state.phase,
    kind: state.kind,
    actor: "human",
    event: { type: "requestChanges" },
  });
  if (!moved.ok) return blockedCard(header, moved.code, reloadNext("ui", session.cards));
  await commitState(
    session,
    change,
    { ...state, phase: moved.phase },
    "review.changes_requested",
    { revision: state.revision, comments: open },
    "human",
  );
  return decisionCard(
    header,
    [changesRequestedLine([...open, ...rejected], session.lang)],
    session.cards,
  );
}
