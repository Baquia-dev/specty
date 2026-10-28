// SPDX-License-Identifier: Apache-2.0
// How the screens name a revision: its number and what it is, never a bare "r3" (docs/ui.md).
import type { Lang, Phase } from "@baquia-dev/specty-core";
import type { Bilingual, ChangeView } from "./records";

type RevisionOf = Pick<ChangeView, "phase" | "revision" | "approved" | "decision">;

/** What the current revision is, by the change's phase. */
const STATES: Readonly<Record<Phase, Bilingual>> = {
  draft: { es: "sin proponer", en: "not proposed" },
  review: { es: "por aprobar", en: "to approve" },
  testing: { es: "aprobada", en: "approved" },
  adjusting: { es: "aprobada, en ajuste", en: "approved, being adjusted" },
  implementing: { es: "aprobada", en: "approved" },
  acceptance: { es: "aprobada", en: "approved" },
  closing: { es: "aceptada, en cierre", en: "accepted, being closed" },
  done: { es: "cerrada", en: "closed" },
  cancelled: { es: "cancelada", en: "cancelled" },
};

/** Once the agent sends the closing, it waits for the person. */
const CLOSING_SENT: Bilingual = { es: "cierre por confirmar", en: "closing to confirm" };

/** «por aprobar», «aprobada»… */
export function revisionState(change: RevisionOf): Bilingual {
  return change.phase === "closing" && change.decision === "closing"
    ? CLOSING_SENT
    : STATES[change.phase];
}

/** «Revisión 3 · por aprobar». A draft never proposed has no number yet: «Sin proponer». */
export function revisionName(change: RevisionOf): Bilingual {
  if (change.revision === 0) return { es: "Sin proponer", en: "Not proposed" };
  const state = revisionState(change);
  return {
    es: `Revisión ${change.revision} · ${state.es}`,
    en: `Revision ${change.revision} · ${state.en}`,
  };
}

/** «21 oct» / «Oct 21»; with the year when it is not the current one. */
function shortDate(iso: string, lang: Lang, now: number): string {
  const date = new Date(iso);
  const otherYear = date.getUTCFullYear() !== new Date(now).getUTCFullYear();
  return new Intl.DateTimeFormat(lang, {
    day: "numeric",
    month: "short",
    ...(otherYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(date);
}

/**
 * Which revision is approved, when and by whom: in a team it is not always who is looking.
 * «La 2 está aprobada · 21 oct · Ana Gómez»; when the current one is it, «Aprobada el 21 oct…».
 * In delegated mode the agent approved for the person: «… por el agente de Ana Gómez».
 */
export function approvedNote(
  change: RevisionOf,
  lang: Lang,
  now: number = Date.now(),
): string | undefined {
  const approved = change.approved;
  if (approved === undefined) return undefined;
  const date = shortDate(approved.at, lang, now);
  const agent =
    approved.delegated === true
      ? { es: `por el agente de ${approved.by}`, en: `by ${approved.by}'s agent` }
      : undefined;
  if (approved.revision === change.revision) {
    if (agent !== undefined)
      return lang === "es" ? `Aprobada el ${date} ${agent.es}` : `Approved on ${date} ${agent.en}`;
    return lang === "es"
      ? `Aprobada el ${date} · ${approved.by}`
      : `Approved on ${date} · ${approved.by}`;
  }
  const who = agent?.[lang] ?? approved.by;
  return lang === "es"
    ? `La ${approved.revision} está aprobada · ${date} · ${who}`
    : `Revision ${approved.revision} is approved · ${date} · ${who}`;
}
