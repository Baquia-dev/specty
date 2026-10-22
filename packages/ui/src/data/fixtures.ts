// SPDX-License-Identifier: Apache-2.0
import { Injectable, inject } from "@angular/core";
import type { ChangeState, Phase } from "@baquia-dev/specty-core";
import { Commands } from "../components/command-palette";
import {
  ActionError,
  type ChangeRecord,
  type CommentAnchor,
  type CommentRecord,
  SpectyData,
} from "./records";
import { SAMPLE_SPECS } from "./sample-specs";

const HASH = `sha256:${"0".repeat(64)}`;
const MINUTE = 60_000;
/** The reviewer of the sample project: a fictional person. */
export const REVIEWER = "Ana Gómez";

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

/** The sample project "Mi colegio": every pending decision, work in progress and recent changes. */
export function sampleRecords(now: number): ChangeRecord[] {
  return [
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
    sample(
      "20261019-boletines-pdf",
      "implementing",
      3,
      now,
      {
        pending: {
          scopeRequests: [
            {
              id: "S1",
              task: "T3",
              paths: ["lib/shared/pdf/layout.dart"],
              reason: "La firma necesita el maquetador compartido.",
            },
          ],
          adjustment: null,
        },
      },
      ["done", "done", "active"],
    ),
    sample("20261018-asistencia-curso", "acceptance", 95, now, {}, ["done", "done"]),
    sample(
      "20261017-recordatorios-correo",
      "closing",
      40,
      now,
      { closingSubmittedAt: new Date(now - 40 * MINUTE).toISOString() },
      ["done"],
    ),
    sample("20261021-login-google", "implementing", 25, now, {}, ["done", "active"]),
    sample("20261021-modo-oscuro", "draft", 8, now),
    sample("20261015-redondeo-promedios", "done", 60 * 26, now, {}, ["done"]),
    sample("20261014-chat-docentes", "cancelled", 60 * 72, now),
  ];
}

/**
 * Prototype data source: the sample project in memory. Its "Simulate" commands move the samples
 * the way the local server will, so live updates can be tried without it.
 */
@Injectable()
export class FixtureData extends SpectyData {
  private records = sampleRecords(Date.now());
  private readonly listeners = new Set<() => void>();
  private failing = false;

  constructor() {
    super();
    const commands = inject(Commands);
    const simulate = (id: string, es: string, en: string, run: () => void) =>
      commands.register({
        id: `simulate:${id}`,
        label: { es: `Simular: ${es}`, en: `Simulate: ${en}` },
        run,
      });
    simulate("approve", "aprobar la spec en revisión", "approve the spec in review", () =>
      this.approveSpec(),
    );
    simulate("scope", "aprobar la solicitud de alcance", "approve the scope request", () =>
      this.approveScope(),
    );
    simulate("task", "terminar una tarea", "finish a task", () => this.finishTask());
    simulate("outage", "cortar o recuperar la conexión", "drop or restore the connection", () =>
      this.toggleOutage(),
    );
  }

  changes(): Promise<readonly ChangeRecord[]> {
    if (this.failing) return Promise.reject(new Error("No se pudo leer .specty/ (simulado)."));
    return Promise.resolve(this.records);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  approveSpec(): void {
    this.update(
      (state) => state.phase === "review",
      (state) => ({ ...state, phase: "implementing" }),
    );
  }

  approveScope(): void {
    this.update(
      (state) => state.pending.scopeRequests.length > 0,
      (state) => ({ ...state, pending: { ...state.pending, scopeRequests: [] } }),
    );
  }

  /** Marks the active task done; with none left, the change moves to acceptance. */
  finishTask(): void {
    const activeTask = (state: ChangeState) =>
      Object.entries(state.tasks).find(([, task]) => task.status === "active");
    this.update(
      (state) =>
        state.phase === "implementing" &&
        state.pending.scopeRequests.length === 0 &&
        activeTask(state) !== undefined,
      (state) => {
        const [id, task] = activeTask(state) ?? [];
        if (id === undefined || task === undefined) return state;
        const tasks = { ...state.tasks, [id]: { ...task, status: "done" as const } };
        const left = Object.values(tasks).some((entry) => entry.status !== "done");
        return { ...state, tasks, phase: left ? state.phase : "acceptance" };
      },
    );
  }

  toggleOutage(): void {
    this.failing = !this.failing;
    this.notify();
  }

  override decideAssumption(
    change: string,
    item: string,
    decision: "confirmed" | "rejected",
    comment?: string,
  ): Promise<void> {
    return this.edit(change, (record) => ({
      ...record,
      state: {
        ...record.state,
        items: {
          ...record.state.items,
          [item]: { hash: HASH, decision, ...(comment ? { comment } : {}) },
        },
      },
    }));
  }

  override addComment(change: string, anchor: CommentAnchor, body: string): Promise<void> {
    return this.edit(change, (record) => {
      const comments = record.comments ?? [];
      const comment: CommentRecord = {
        id: `c${comments.length + 1}`,
        revision: record.state.revision,
        anchor,
        author: REVIEWER,
        body,
        createdAt: new Date().toISOString(),
      };
      return { ...record, comments: [...comments, comment] };
    });
  }

  /** The agent gets the comments in `specty next`; here nothing else changes. */
  override requestChanges(change: string): Promise<void> {
    return this.edit(change, (record) => record);
  }

  override approve(change: string, revision: number): Promise<void> {
    return this.edit(change, (record) => {
      if (record.state.revision !== revision) {
        throw new ActionError({
          es: `La spec cambió: ahora es la revisión ${record.state.revision}. Revísala de nuevo.`,
          en: `The spec changed: it is now revision ${record.state.revision}. Review it again.`,
        });
      }
      const at = new Date().toISOString();
      return {
        ...record,
        phaseSince: at,
        state: {
          ...record.state,
          phase: "implementing",
          approved: { revision, hash: HASH, at, by: REVIEWER, channel: "ui" },
        },
      };
    });
  }

  /** Applies `change` to one record and tells the subscribers; a thrown ActionError rejects. */
  private edit(id: string, change: (record: ChangeRecord) => ChangeRecord): Promise<void> {
    const record = this.records.find((item) => item.state.id === id);
    if (record === undefined) {
      return Promise.reject(
        new ActionError({ es: `No existe el cambio ${id}.`, en: `There is no change ${id}.` }),
      );
    }
    try {
      const updated = change(record);
      this.records = this.records.map((item) => (item === record ? updated : item));
    } catch (error) {
      return Promise.reject(error);
    }
    this.notify();
    return Promise.resolve();
  }

  /** Changes the first record that `matches`; a new phase restarts its waiting time. */
  private update(
    matches: (state: ChangeState) => boolean,
    change: (state: ChangeState) => ChangeState,
  ): void {
    const index = this.records.findIndex((record) => matches(record.state));
    const record = this.records[index];
    if (record === undefined) return;
    const state = change(record.state);
    const phaseSince =
      state.phase === record.state.phase ? record.phaseSince : new Date().toISOString();
    this.records = this.records.map((item, at) =>
      at === index ? { ...record, state, phaseSince } : item,
    );
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
