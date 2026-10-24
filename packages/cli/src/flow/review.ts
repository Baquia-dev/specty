// SPDX-License-Identifier: Apache-2.0
import {
  blockedCard,
  decisionCard,
  headerOf,
  nothingPendingCard,
  type Output,
  transition,
  translator,
} from "@baquia-dev/specty-core";
import type { Session } from "../session";
import type { StoredChange } from "../store/changes";
import { type CommentAnchor, readComments, writeComments } from "../store/comments";
import { commitState } from "./active";

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
  const t = translator(session.lang);
  const { state } = change;
  if (state.phase !== "review")
    return nothingPendingCard(state.id, state.phase, "approve", session.cards);
  const header = headerOf(state.id, "review");
  const current = ASSUMPTION.test(item) ? state.items[item] : undefined;
  if (current === undefined) {
    return blockedCard(
      header,
      t(`La spec no tiene el supuesto ${item}.`, `The spec has no assumption ${item}.`),
      t("vuelve a cargar la revisión.", "reload the review."),
    );
  }
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
  return decisionCard(
    header,
    [
      decision === "confirmed"
        ? t(`${item} confirmado.`, `${item} confirmed.`)
        : t(
            `${item} rechazado: el agente debe corregir la spec.`,
            `${item} rejected: the agent must fix the spec.`,
          ),
    ],
    session.cards,
  );
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
  const t = translator(session.lang);
  const { state } = change;
  if (state.phase !== "review")
    return nothingPendingCard(state.id, state.phase, "approve", session.cards);
  const header = headerOf(state.id, "review");
  const text = body.trim();
  if (text === "") {
    return blockedCard(
      header,
      t("El comentario está vacío.", "The comment is empty."),
      t("escribe qué debe cambiar.", "write what should change."),
    );
  }
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
  return decisionCard(
    header,
    [
      t(
        `Comentario ${id} guardado; cuando termines, pide los cambios.`,
        `Comment ${id} saved; when you are done, ask for the changes.`,
      ),
    ],
    session.cards,
  );
}

/**
 * The person asks the agent for changes: its unresolved comments and rejected assumptions,
 * which `specty next` shows it. The change stays in review.
 */
export async function requestChanges(session: Session, change: StoredChange): Promise<Output> {
  const t = translator(session.lang);
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
  if (open.length === 0 && rejected.length === 0) {
    return blockedCard(
      header,
      t(
        "No hay comentarios sin resolver ni supuestos rechazados que pedir.",
        "There are no unresolved comments or rejected assumptions to ask for.",
      ),
      t(
        "comenta lo que debe cambiar, o aprueba la spec.",
        "comment on what should change, or approve the spec.",
      ),
    );
  }
  const moved = transition({
    phase: state.phase,
    kind: state.kind,
    actor: "human",
    event: { type: "requestChanges" },
  });
  if (!moved.ok)
    return blockedCard(header, moved.code, t("vuelve a cargar la UI.", "reload the UI."));
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
    [
      t(
        `Cambios pedidos al agente: ${[...open, ...rejected].join(", ")}.`,
        `Changes asked of the agent: ${[...open, ...rejected].join(", ")}.`,
      ),
    ],
    session.cards,
  );
}
