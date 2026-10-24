// SPDX-License-Identifier: Apache-2.0
import {
  blockedCard,
  decisionCard,
  headerOf,
  nothingPendingCard,
  type Output,
  translator,
} from "@baquia-dev/specty-core";
import type { Session } from "../session";
import type { StoredChange } from "../store/changes";
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
