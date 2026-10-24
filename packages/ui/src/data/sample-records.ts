// SPDX-License-Identifier: Apache-2.0
// The sample project "Mi colegio" as the source reads it: one record per change, in every phase.
import type { ChangeState, Phase } from "@baquia-dev/specty-core";
import { ActionError, type ChangeRecord } from "./records";
import { asistenciaSample } from "./sample-acceptance";
import { withHistory } from "./sample-history";
import { boletinesProgress, loginProgress, withProgress } from "./sample-progress";
import { revisedSample } from "./sample-revisions";
import { SAMPLE_SPECS } from "./sample-specs";

export const HASH = `sha256:${"0".repeat(64)}`;
const MINUTE = 60_000;
/** The reviewer of the sample project: a fictional person. */
export const REVIEWER = "Ana Gómez";
/** `verify.full` of the sample project's `config.yaml`. */
export const VERIFY_FULL = "flutter analyze && flutter test";

type TaskStatus = "pending" | "active" | "done";

function sample(
  id: string,
  phase: Phase,
  minutesAgo: number,
  now: number,
  extra: Partial<ChangeState> = {},
  tasks: readonly TaskStatus[] = [],
): ChangeRecord {
  const state: ChangeState = {
    schema: 1,
    id,
    kind: id.includes("modo-oscuro") || id.includes("redondeo") ? "quick" : "standard",
    phase,
    branch: `specty/${id}`,
    revision: phase === "draft" ? 0 : 1,
    items: {},
    tasks: Object.fromEntries(
      tasks.map((status, index) => [`T${index + 1}`, { status, attempts: 1, scopeExtra: [] }]),
    ),
    pending: { scopeRequests: [], adjustment: null },
    maxIds: {},
    ...extra,
  };
  return {
    spec: SAMPLE_SPECS[id] ?? "",
    state,
    phaseSince: new Date(now - minutesAgo * MINUTE).toISOString(),
  };
}

/**
 * The sample project "Mi colegio": every pending decision, work in progress and recent changes.
 * Its configuration has a full verification, so every change carries it.
 */
export function sampleRecords(now: number): ChangeRecord[] {
  const records: ChangeRecord[] = [
    {
      ...sample("20261020-evolucion-trimestre", "review", 12, now, {
        revision: 2,
        items: { A1: { hash: HASH, decision: "confirmed" } },
        size: { level: "M", score: 6, adjust: 0, reasons: [] },
      }),
      comments: [
        {
          id: "c1",
          revision: 2,
          anchor: { item: "A3" },
          author: REVIEWER,
          body: "El gráfico actual no tiene leyenda interactiva: revisa si basta.",
          createdAt: new Date(now - 9 * MINUTE).toISOString(),
        },
        {
          id: "c2",
          revision: 2,
          anchor: { section: "design", quote: "una línea por materia" },
          author: REVIEWER,
          body: "Con doce materias, ¿no satura? Quizá agrupar por área.",
          createdAt: new Date(now - 7 * MINUTE).toISOString(),
        },
      ],
    },
    revisedSample(now),
    withProgress(sample("20261019-boletines-pdf", "implementing", 3, now), boletinesProgress(now)),
    asistenciaSample(sample("20261018-asistencia-curso", "acceptance", 95, now), now),
    sample(
      "20261017-recordatorios-correo",
      "closing",
      40,
      now,
      { closingSubmittedAt: new Date(now - 40 * MINUTE).toISOString() },
      ["done"],
    ),
    withProgress(sample("20261021-login-google", "implementing", 25, now), loginProgress(now)),
    sample("20261021-modo-oscuro", "draft", 8, now),
    sample("20261015-redondeo-promedios", "done", 60 * 26, now, {}, ["done"]),
    sample("20261014-chat-docentes", "cancelled", 60 * 72, now),
  ];
  return records.map((record) => withHistory({ ...record, verifyFull: VERIFY_FULL }, now));
}

/**
 * The person asks for changes, as the local server does: the unresolved comments go to the agent
 * in a `review.changes_requested`; with none, and no rejected assumption, there is nothing to ask.
 */
export function requestChangesIn(record: ChangeRecord, now: number): ChangeRecord {
  const { state } = record;
  const open = (record.comments ?? [])
    .filter((comment) => comment.resolvedInRevision === undefined)
    .map((comment) => comment.id);
  const rejected = Object.values(state.items).some((item) => item.decision === "rejected");
  if (state.phase !== "review" || (open.length === 0 && !rejected)) {
    throw new ActionError({
      es: "No hay comentarios sin resolver ni supuestos rechazados que pedir.",
      en: "There are no unresolved comments or rejected assumptions to ask for.",
    });
  }
  const entry = {
    ts: new Date(now).toISOString(),
    actor: "human" as const,
    event: "review.changes_requested",
    data: { revision: state.revision, comments: open },
  };
  return { ...record, audit: [...(record.audit ?? []), entry] };
}
