// SPDX-License-Identifier: Apache-2.0
import { Injectable, inject } from "@angular/core";
import type { ChangeState, Phase } from "@baquia-dev/specty-core";
import { Commands } from "../components/command-palette";
import type { RunRecord } from "./progress";
import {
  ActionError,
  type ChangeRecord,
  type CommentAnchor,
  type CommentRecord,
  SpectyData,
} from "./records";
import { boletinesProgress, decideScopeIn, loginProgress, withProgress } from "./sample-progress";
import { revisedSample } from "./sample-revisions";
import { canFinishTask, finishTaskIn, RunSimulation, runTarget, verifiedIn } from "./sample-run";
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
    revisedSample(now),
    withProgress(sample("20261019-boletines-pdf", "implementing", 3, now), boletinesProgress(now)),
    sample("20261018-asistencia-curso", "acceptance", 95, now, {}, ["done", "done"]),
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
  /** Verifications printing line by line; each leaves its result in the record. */
  private readonly runs = new RunSimulation((change, run, passed) => {
    void this.edit(change, (record) => verifiedIn(record, run, passed, Date.now()));
  });

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
    simulate("verify", "verificar la tarea en curso", "verify the task in progress", () =>
      this.startRun(),
    );
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
    const record = this.records.find((item) => item.state.pending.scopeRequests.length > 0);
    const request = record?.state.pending.scopeRequests[0];
    if (record !== undefined && request !== undefined) {
      void this.decideScope(record.state.id, request.id, "approved");
    }
  }

  /** Verifies the task in progress of the first change that has one, line by line. */
  startRun(): void {
    const target = runTarget(this.records);
    if (target !== undefined) this.runs.start(target);
  }

  override watchRun(change: string, listener: (run: RunRecord | undefined) => void): () => void {
    return this.runs.watch(change, listener);
  }

  /** Marks the active task done; with none left, the change moves to acceptance. */
  finishTask(): void {
    this.update(canFinishTask, finishTaskIn);
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

  override decideScope(
    change: string,
    request: string,
    decision: "approved" | "rejected",
    reason?: string,
  ): Promise<void> {
    return this.edit(change, (record) =>
      decideScopeIn(record, request, decision, reason, Date.now()),
    );
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
