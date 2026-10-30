// SPDX-License-Identifier: Apache-2.0
import { Injectable, inject } from "@angular/core";
import type { ChangeState } from "@baquia-dev/specty-core";
import { Commands } from "../components/command-palette";
import type { ResultDecision } from "./acceptance";
import type { RunRecord } from "./progress";
import {
  ActionError,
  type Bilingual,
  type ChangeRecord,
  type CommentAnchor,
  type CommentRecord,
  type Delegation,
  SpectyData,
} from "./records";
import { decideResultIn } from "./sample-acceptance";
import { sampleDelegation } from "./sample-delegation";
import { sampleDiffOf } from "./sample-diffs";
import { decideScopeIn } from "./sample-progress";
import { HASH, REVIEWER, requestChangesIn, sampleRecords } from "./sample-records";
import {
  canFinishTask,
  finishTaskIn,
  fullTarget,
  RunSimulation,
  runTarget,
  verifiedIn,
} from "./sample-run";
import { approveTestsIn } from "./sample-tests";
import { sampleTrace, sampleTraceFiles } from "./sample-trace";
import type { TraceRecord } from "./trace";

export { REVIEWER, sampleRecords } from "./sample-records";

/**
 * Prototype data source: the sample project in memory. Its "Simulate" commands move the samples
 * the way the local server will, so live updates can be tried without it.
 */
@Injectable()
export class FixtureData extends SpectyData {
  private records = sampleRecords(Date.now());
  private delegated = sampleDelegation(false);
  private readonly listeners = new Set<() => void>();
  private failing = false;
  /** The next full verification fails: to see both results without the CLI. */
  private fullFails = false;
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
    simulate(
      "full",
      "alternar el resultado de la verificación completa",
      "toggle the result of the full verification",
      () => this.toggleFullResult(),
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

  /** The sample's diffs: those of «Panel de asistencia por curso»; the other changes show none. */
  override diff(change: string, task?: string): Promise<string> {
    return sampleDiffOf(this.records, change, task);
  }

  /** The sample's traceability, from those same diffs; the other changes have no commits. */
  override traceFiles(change: string): Promise<readonly string[]> {
    return sampleTraceFiles(this.records, change);
  }

  override trace(change: string, path: string): Promise<TraceRecord> {
    return sampleTrace(this.records, change, path);
  }

  /** The prototype takes every decision. */
  override readOnly(): Promise<Bilingual | undefined> {
    return Promise.resolve(undefined);
  }

  override delegation(): Promise<Delegation> {
    return Promise.resolve(this.delegated);
  }

  override setDelegation(on: boolean): Promise<void> {
    this.delegated = sampleDelegation(on);
    this.notify();
    return Promise.resolve();
  }

  /** The full verification of a change in acceptance, line by line; one run at a time. */
  override verifyChange(change: string): Promise<void> {
    const record = this.records.find((item) => item.state.id === change);
    try {
      this.runs.start(fullTarget(record, !this.fullFails, this.runs.busy(change)));
    } catch (error) {
      return Promise.reject(error);
    }
    return Promise.resolve();
  }

  toggleFullResult(): void {
    this.fullFails = !this.fullFails;
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

  override editComment(change: string, id: string, body: string): Promise<void> {
    return this.edit(change, (record) => {
      const comments = record.comments ?? [];
      const updated = comments.map((comment) =>
        comment.id === id ? { ...comment, body } : comment,
      );
      return { ...record, comments: updated };
    });
  }

  override deleteComment(change: string, id: string): Promise<void> {
    return this.edit(change, (record) => {
      const comments = record.comments ?? [];
      const filtered = comments.filter((comment) => comment.id !== id);
      return { ...record, comments: filtered };
    });
  }

  /** Noted in the audit, as the server does: the agent gets the comments in `specty next`. */
  override requestChanges(change: string): Promise<void> {
    return this.edit(change, (record) => requestChangesIn(record, Date.now()));
  }

  override approve(change: string, revision: number): Promise<void> {
    return this.edit(change, (record) => {
      if (record.state.revision !== revision) {
        throw new ActionError({
          es: `La spec cambió: ahora es la revisión ${record.state.revision}. Revísala de nuevo.`,
          en: `The spec changed: it is now revision ${record.state.revision}. Review it again.`,
        });
      }
      // In testing, the approval is the tests' (the gate 2), as on the server.
      if (record.state.phase === "testing") return approveTestsIn(record, Date.now(), HASH);
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

  override decideResult(change: string, decision: ResultDecision): Promise<void> {
    return this.edit(change, (record) => decideResultIn(record, decision, Date.now()));
  }

  /** As `specty close`: only a closing the agent sent; the change is done (archived, in the CLI). */
  override confirmClosing(change: string): Promise<void> {
    return this.edit(change, (record) => {
      const { state } = record;
      if (state.phase !== "closing") {
        throw new ActionError({
          es: "Este cambio no espera que confirmes un cierre.",
          en: "This change is not waiting for you to confirm a closing.",
        });
      }
      if (state.closingSubmittedAt === undefined) {
        throw new ActionError({
          es: "El agente aún no ha enviado el cierre: espera a que lo haga.",
          en: "The agent has not sent the closing yet: wait for it.",
        });
      }
      const at = new Date().toISOString();
      return {
        ...record,
        phaseSince: at,
        state: { ...state, phase: "done" },
        audit: [
          ...(record.audit ?? []),
          { ts: at, actor: "human", event: "change.closed", data: {} },
        ],
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
