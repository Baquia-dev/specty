// SPDX-License-Identifier: Apache-2.0
// The history of each sample change, from its creation to its phase now (docs/ui.md, Historial),
// joined by time to the events the samples already carry: tasks, verifications and scope.
import type { AuditRecord } from "./progress";
import type { ChangeRecord } from "./records";
// Used only when a sample is built, never while the modules load, so the cycle is harmless.
import { REVIEWER } from "./sample-records";

const MINUTE = 60_000;
const HOUR = 60;

/** An event, so many minutes before now. */
type Step = readonly [
  minutesAgo: number,
  actor: AuditRecord["actor"],
  event: string,
  data?: Readonly<Record<string, unknown>>,
];

const created = (minutes: number, id: string, kind = "standard"): Step => [
  minutes,
  "agent",
  "change.created",
  { kind, branch: `specty/${id}` },
];

/** What happened before and around the events each sample already has. */
const STEPS: Readonly<Record<string, readonly Step[]>> = {
  "20261020-evolucion-trimestre": [
    [
      4 * HOUR,
      "agent",
      "change.created",
      {
        kind: "standard",
        branch: "specty/20261020-evolucion-trimestre",
        request:
          "En el panel del estudiante quiero ver la evolución por trimestre, no solo mes a mes; el gráfico de ahora me sirve.",
      },
    ],
    [3 * HOUR + 50, "agent", "spec.proposed", { revision: 1, size: "M", warnings: 1 }],
    [3 * HOUR, "human", "review.changes_requested", { revision: 1, comments: ["c0"] }],
    [12, "agent", "spec.proposed", { revision: 2, size: "M", warnings: 0 }],
    [10, "human", "assumption.decided", { item: "A1", decision: "confirmed" }],
  ],
  "20261016-justificar-faltas": [
    created(120 * HOUR, "20261016-justificar-faltas"),
    [118 * HOUR, "agent", "spec.proposed", { revision: 1, size: "M", warnings: 0 }],
    [100 * HOUR, "human", "review.changes_requested", { revision: 1, comments: ["c1", "c2"] }],
    [80 * HOUR, "agent", "spec.proposed", { revision: 2, size: "M", warnings: 0 }],
    [72 * HOUR, "human", "spec.approved", { revision: 2, channel: "ui" }],
    [70 * HOUR, "agent", "task.started", { task: "T1", baseCommit: "b41e0a2" }],
    [
      66 * HOUR,
      "specty",
      "task.verified",
      { task: "T1", cmd: "flutter test", exit: 0, ms: 15_000 },
    ],
    [66 * HOUR - 1, "agent", "task.completed", { task: "T1", commit: "c7d2f19" }],
    [65 * HOUR, "agent", "task.started", { task: "T2", baseCommit: "c7d2f19" }],
    [
      63 * HOUR,
      "specty",
      "task.verified",
      { task: "T2", cmd: "flutter test", exit: 0, ms: 11_000 },
    ],
    [63 * HOUR - 1, "agent", "task.completed", { task: "T2", commit: "e18a5b3" }],
    [
      HOUR,
      "human",
      "adjust.requested",
      { request: "Que también se pueda adjuntar un PDF, y que la familia reciba un aviso." },
    ],
    [30, "agent", "spec.proposed", { revision: 3, size: "M", warnings: 0 }],
  ],
  "20261019-boletines-pdf": [
    created(3 * HOUR, "20261019-boletines-pdf"),
    [2 * HOUR + 50, "agent", "spec.proposed", { revision: 1, size: "L", warnings: 0 }],
    [50, "human", "spec.approved", { revision: 1, channel: "tty" }],
  ],
  "20261018-asistencia-curso": [
    created(5 * HOUR, "20261018-asistencia-curso"),
    [4 * HOUR + 50, "agent", "spec.proposed", { revision: 1, size: "S", warnings: 0 }],
    [3 * HOUR, "human", "spec.approved", { revision: 1, channel: "ui" }],
  ],
  // No verification and no commit here: its acceptance shows a task done without either.
  "20261017-recordatorios-correo": [
    created(30 * HOUR, "20261017-recordatorios-correo"),
    [29 * HOUR, "agent", "spec.proposed", { revision: 1, size: "S", warnings: 0 }],
    [28 * HOUR, "human", "spec.approved", { revision: 1, channel: "tty" }],
    [27 * HOUR, "agent", "task.started", { task: "T1" }],
    [3 * HOUR, "agent", "task.completed", { task: "T1", summary: "Tarea programada a las 18:00." }],
    [90, "human", "change.accepted", { revision: 1 }],
    [40, "agent", "spec.proposed", { revision: 1, size: "S", warnings: 0 }],
  ],
  "20261021-login-google": [
    created(2 * HOUR, "20261021-login-google"),
    [HOUR + 50, "agent", "spec.proposed", { revision: 1, size: "M", warnings: 0 }],
    [70, "human", "spec.approved", { revision: 1, channel: "ui" }],
  ],
  "20261021-modo-oscuro": [created(8, "20261021-modo-oscuro", "quick")],
  "20261015-redondeo-promedios": [
    created(30 * HOUR, "20261015-redondeo-promedios", "quick"),
    [29 * HOUR + 50, "agent", "spec.proposed", { revision: 1, size: "S", warnings: 0 }],
    [29 * HOUR + 40, "human", "spec.approved", { revision: 1, channel: "tty" }],
    [29 * HOUR, "agent", "task.started", { task: "T1" }],
    [
      27 * HOUR,
      "agent",
      "task.completed",
      { task: "T1", summary: "Redondeo a una cifra decimal." },
    ],
    [26 * HOUR, "human", "change.closed", { lane: "quick" }],
  ],
  "20261014-chat-docentes": [
    created(100 * HOUR, "20261014-chat-docentes"),
    [99 * HOUR, "agent", "spec.proposed", { revision: 1, size: "L", warnings: 2 }],
    [
      72 * HOUR,
      "human",
      "change.cancelled",
      { reason: "La dirección prefiere la mensajería del ministerio." },
    ],
  ],
};

/**
 * The sample with its whole history, in time order. Each line says who: the reviewer by her
 * name, and the agent its tool, its model and its effort.
 */
export function withHistory(record: ChangeRecord, now: number): ChangeRecord {
  const steps = STEPS[record.state.id] ?? [];
  const added = steps.map(
    ([minutes, actor, event, data]): AuditRecord => ({
      ts: new Date(now - minutes * MINUTE).toISOString(),
      actor,
      event,
      data: data ?? {},
    }),
  );
  const audit = [...(record.audit ?? []), ...added]
    .map(saidWho)
    .toSorted((a, b) => a.ts.localeCompare(b.ts));
  return audit.length === 0 ? record : { ...record, audit };
}

function saidWho(line: AuditRecord): AuditRecord {
  if (line.actor === "human") return { by: REVIEWER, ...line };
  if (line.actor === "agent") {
    return { tool: "claude-code", model: "claude-opus-5-5", effort: "high", ...line };
  }
  return line;
}
