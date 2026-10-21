// SPDX-License-Identifier: Apache-2.0
import {
  blockedCard,
  headerOf,
  nextCard,
  type Output,
  transition,
  translator,
} from "@baquia-dev/specty-core";
import { commitState, resolveActive } from "../flow/active";
import { changeView } from "../flow/views";
import type { Session } from "../session";

/** `specty adjust`: records the user's literal request and returns the classification protocol. */
export async function adjust(session: Session, request: string): Promise<Output> {
  const t = translator(session.lang);
  const { cards } = session;
  const active = await resolveActive(session);
  const nextStep = t(`ejecuta \`${cards.command} next\`.`, `run \`${cards.command} next\`.`);
  if (active === undefined) {
    return blockedCard(
      headerOf(),
      t("No hay un cambio activo.", "There is no active change."),
      nextStep,
    );
  }
  const { state } = active;
  if (request.trim().length === 0) {
    return {
      ...blockedCard(
        headerOf(state.id, state.phase),
        t("Falta la petición del usuario.", "The user's request is missing."),
        t(
          `ejecuta \`${cards.command} adjust "<petición literal>"\`.`,
          `run \`${cards.command} adjust "<literal request>"\`.`,
        ),
      ),
      status: "invalid",
    };
  }
  const moved = transition({
    phase: state.phase,
    kind: state.kind,
    actor: session.actor,
    event: { type: "adjust" },
  });
  if (!moved.ok) {
    return blockedCard(
      headerOf(state.id, state.phase),
      t(
        "Los ajustes se piden cuando el resultado está en aceptación.",
        "Adjustments are requested while the result is in acceptance.",
      ),
      nextStep,
    );
  }
  const at = session.environment.now().toISOString();
  const updated = await commitState(
    session,
    active,
    {
      ...state,
      phase: moved.phase,
      pending: { ...state.pending, adjustment: { request: request.trim(), at } },
    },
    "adjust.requested",
    { request: request.trim() },
  );
  return nextCard({ change: await changeView(session, updated), dirty: [] }, cards);
}
