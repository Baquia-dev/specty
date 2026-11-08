// SPDX-License-Identifier: Apache-2.0
import { Injectable, inject } from "@angular/core";
import type { ChangeState } from "@baquia-dev/specty-core";
import type { SessionView } from "@baquia-dev/specty-core/light";
import { Commands } from "../components/command-palette";
import type { ResultDecision } from "./acceptance";
import type { RunRecord } from "./progress";
import {
  ActionError,
  type Bilingual,
  type ChangeRecord,
  type CommentAnchor,
  type Delegation,
  type MemoryRecord,
  SpectyData,
  type SpectySwitch,
} from "./records";
import { confirmClosingIn, decideResultIn } from "./sample-acceptance";
import { sampleDelegation } from "./sample-delegation";
import { sampleDiffOf } from "./sample-diffs";
import { decidedIn, sampleMemory } from "./sample-memory";
import { decideScopeIn } from "./sample-progress";
import { requestChangesIn, sampleRecords } from "./sample-records";
import {
  addCommentIn,
  approveIn,
  decideAssumptionIn,
  deleteCommentIn,
  editCommentIn,
} from "./sample-review";
import {
  canFinishTask,
  finishTaskIn,
  fullTarget,
  RunSimulation,
  runTarget,
  verifiedIn,
} from "./sample-run";
import { sampleSwitch, turnedSwitch } from "./sample-switch";
import { sampleTestCode } from "./sample-test-code";
import { sampleTrace, sampleTraceFiles } from "./sample-trace";
import type { MemoryVerb } from "./source";
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
  private switched = sampleSwitch();
  private remembered = sampleMemory();
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
    simulate("unattended", "nadie retoma tu decisión", "nobody picks up your decision", () =>
      this.toggleUnattended(),
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

  /** The code of the sample's tests: those sent, those locked and those unlocked. */
  override testCode(change: string, path: string): Promise<string> {
    return sampleTestCode(this.records, change, path);
  }

  /** The prototype takes every decision. */
  override readOnly(): Promise<Bilingual | undefined> {
    return Promise.resolve(undefined);
  }

  override delegation(): Promise<Delegation> {
    return Promise.resolve(this.delegated);
  }

  override specty(): Promise<SpectySwitch> {
    return Promise.resolve(this.switched);
  }

  /** A memory with an entry of every kind and status, and changes held, waiting and orphaned. */
  override memory(): Promise<MemoryRecord> {
    return Promise.resolve(this.remembered);
  }

  /** A live Claude Code session on a change, with its usage, and a quiet Codex one elsewhere. */
  override sessions(): Promise<readonly SessionView[]> {
    const before = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
    const change = this.remembered.changes[0]?.id;
    return Promise.resolve([
      {
        tool: "claude-code",
        conversation: "sesion-1",
        folder: change === undefined ? "" : `.worktrees/${change}`,
        ...(change === undefined ? {} : { change }),
        first: before(95),
        last: before(1),
        live: true,
        usage: { tokens: 2_350_000, cost: 4.82 },
      },
      {
        tool: "codex",
        conversation: "hilo-7",
        folder: ".worktrees/20261103-exportar-notas",
        first: before(300),
        last: before(140),
        live: false,
      },
    ]);
  }

  /** The prototype decides like the person at their terminal: the entry changes at once. */
  override memoryAction(id: string, verb: MemoryVerb, reason?: string): Promise<void> {
    const at = new Date().toISOString();
    const entries = this.remembered.entries.map((entry) =>
      entry.id === id ? decidedIn(entry, verb, reason, at) : entry,
    );
    this.remembered = { ...this.remembered, entries };
    this.notify();
    return Promise.resolve();
  }

  override setDelegation(on: boolean): Promise<void> {
    this.delegated = sampleDelegation(on);
    this.notify();
    return Promise.resolve();
  }

  /** Like the server, the state it already has adds nothing and tells no one. */
  override setSpecty(on: boolean): Promise<void> {
    const turned = turnedSwitch(this.switched, on, Date.now());
    if (turned === this.switched) return Promise.resolve();
    this.switched = turned;
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

  /**
   * The example of a change nobody picks up: the first one in implementation, as the local server
   * says it when the agent's `specty wait` ran out of time after the person decided; or again not.
   */
  toggleUnattended(): void {
    const record = this.records.find((item) => item.state.phase === "implementing");
    if (record === undefined) return;
    const unattended = {
      since: new Date().toISOString(),
      wait: { tool: "claude-code", ended: "timeout" as const, ago: 12 },
    };
    void this.edit(record.state.id, ({ unattended: shown, ...rest }) =>
      shown === undefined ? { ...rest, unattended } : rest,
    );
  }

  override decideAssumption(
    change: string,
    item: string,
    decision: "confirmed" | "rejected",
    comment?: string,
  ): Promise<void> {
    return this.edit(change, (record) => decideAssumptionIn(record, item, decision, comment));
  }

  override addComment(change: string, anchor: CommentAnchor, body: string): Promise<void> {
    return this.edit(change, (record) => addCommentIn(record, anchor, body, Date.now()));
  }

  override editComment(change: string, id: string, body: string): Promise<void> {
    return this.edit(change, (record) => editCommentIn(record, id, body));
  }

  override deleteComment(change: string, id: string): Promise<void> {
    return this.edit(change, (record) => deleteCommentIn(record, id));
  }

  /** Noted in the audit, as the server does: the agent gets the comments in `specty next`. */
  override requestChanges(change: string): Promise<void> {
    return this.edit(change, (record) => requestChangesIn(record, Date.now()));
  }

  override approve(change: string, revision: number): Promise<void> {
    return this.edit(change, (record) => approveIn(record, revision, Date.now()));
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
    return this.edit(change, (record) => confirmClosingIn(record, Date.now()));
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
