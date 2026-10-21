// SPDX-License-Identifier: Apache-2.0
import {
  blockedCard,
  type ChangeState,
  headerOf,
  notInteractiveCard,
  type Output,
  translator,
} from "@baquia-dev/specty-core";
import { resolveActive } from "../flow/active";
import type { Session } from "../session";
import type { StoredChange } from "../store/changes";

// Shared by the commands only a person may run.

export type Guarded =
  | { readonly kind: "output"; readonly output: Output }
  | { readonly kind: "change"; readonly change: StoredChange };

export async function humanChange(session: Session, action: string): Promise<Guarded> {
  const t = translator(session.lang);
  if (!session.environment.terminal.interactive)
    return { kind: "output", output: notInteractiveCard(action, session.cards) };
  const change = await resolveActive(session);
  if (change === undefined) {
    return {
      kind: "output",
      output: blockedCard(
        headerOf(),
        t("No hay un cambio activo.", "There is no active change."),
        t(
          `revisa \`${session.cards.command} status\`.`,
          `check \`${session.cards.command} status\`.`,
        ),
      ),
    };
  }
  return { kind: "change", change };
}

export function postponed(session: Session, state: ChangeState): Output {
  const t = translator(session.lang);
  return {
    status: "ok",
    header: headerOf(state.id, state.phase),
    blocks: [{ lines: [t("Nada cambió.", "Nothing changed.")] }],
    next: t(
      `revisa \`${session.cards.command} status\` cuando quieras decidir.`,
      `check \`${session.cards.command} status\` when you want to decide.`,
    ),
  };
}
