// SPDX-License-Identifier: Apache-2.0
import {
  blockedCard,
  decisionCard,
  headerOf,
  nothingPendingCard,
  notInteractiveCard,
  type Output,
  transition,
  translator,
} from "@baquia-dev/specty-core";
import { commitState, resolveActive } from "../flow/active";
import type { Session } from "../session";
import type { StoredChange } from "../store/changes";
import { withExtras } from "./scope";

/** `specty reject --scope S`: a person turns down a scope request. */
export async function reject(
  session: Session,
  scope: string,
  reason: string | undefined,
): Promise<Output> {
  const { cards } = session;
  if (!session.environment.terminal.interactive) return notInteractiveCard("reject", cards);
  const t = translator(session.lang);
  const active = await resolveActive(session);
  if (active === undefined) {
    return blockedCard(
      headerOf(),
      t("No hay un cambio activo.", "There is no active change."),
      t(`revisa \`${cards.command} status\`.`, `check \`${cards.command} status\`.`),
    );
  }
  return decideScope(session, active, scope, "reject", reason);
}

export async function decideScope(
  session: Session,
  active: StoredChange,
  scope: string,
  decision: "approve" | "reject",
  reason: string | undefined,
): Promise<Output> {
  const t = translator(session.lang);
  const { state } = active;
  const { terminal } = session.environment;
  if (state.phase !== "implementing")
    return nothingPendingCard(state.id, state.phase, decision, session.cards);
  const header = headerOf(state.id, "implementing");
  const request = state.pending.scopeRequests.find(
    (entry) => entry.id === scope.trim().toUpperCase(),
  );
  if (request === undefined) {
    return blockedCard(
      header,
      t(`No existe la solicitud ${scope}.`, `There is no request ${scope}.`),
      t(
        `revisa \`${session.cards.command} status\`.`,
        `check \`${session.cards.command} status\`.`,
      ),
    );
  }
  terminal.note(
    `${request.id} · ${request.task}`,
    `${request.paths.join("\n")}\n— ${request.reason}`,
  );
  const why =
    decision === "reject"
      ? (reason ??
        (await terminal.ask(
          t(
            "¿Por qué la rechazas? (lo leerá el agente)",
            "Why do you reject it? (the agent will read it)",
          ),
        )))
      : undefined;
  const confirmed = await terminal.confirm(
    decision === "approve"
      ? t(
          `¿Aprobar ${request.id} para ${request.task}?`,
          `Approve ${request.id} for ${request.task}?`,
        )
      : t(`¿Rechazar ${request.id}?`, `Reject ${request.id}?`),
  );
  if (!confirmed) {
    return {
      status: "ok",
      header,
      blocks: [{ lines: [t("Nada cambió.", "Nothing changed.")] }],
      next: t(
        `revisa \`${session.cards.command} status\`.`,
        `check \`${session.cards.command} status\`.`,
      ),
    };
  }
  const moved = transition({
    phase: "implementing",
    kind: state.kind,
    actor: "human",
    event: { type: "decideScope" },
  });
  if (!moved.ok)
    return blockedCard(
      header,
      moved.code,
      t(
        `revisa \`${session.cards.command} status\`.`,
        `check \`${session.cards.command} status\`.`,
      ),
    );
  const remaining = state.pending.scopeRequests.filter((entry) => entry !== request);
  const base = { ...state, pending: { ...state.pending, scopeRequests: remaining } };
  const next = decision === "approve" ? withExtras(base, request.task, request.paths) : base;
  await commitState(
    session,
    active,
    next,
    "scope.decided",
    {
      id: request.id,
      decision: decision === "approve" ? "approved" : "rejected",
      ...(why !== undefined && why.trim().length > 0 ? { reason: why.trim() } : {}),
    },
    "human",
  );
  return decisionCard(
    header,
    [
      decision === "approve"
        ? t(
            `${request.id} aprobada: ${request.paths.join(", ")} entra en el alcance de ${request.task}.`,
            `${request.id} approved: ${request.paths.join(", ")} joins the scope of ${request.task}.`,
          )
        : t(`${request.id} rechazada.`, `${request.id} rejected.`),
    ],
    session.cards,
  );
}
