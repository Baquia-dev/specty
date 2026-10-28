// SPDX-License-Identifier: Apache-2.0
import type { Phase } from "../flow/phases";
import type { Lang } from "../i18n";
import { lookup } from "../lookup";
import { headerOf, type Output, section } from "../output";
import type { ChangeKind } from "../spec/model";
import { translator } from "./text";
import type { CardContext } from "./view";

/** A line of `audit.jsonl` (formats.md §4), as it is. */
export interface AuditEvent {
  readonly ts: string;
  readonly actor: string;
  readonly tool?: string;
  readonly event: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface AuditTask {
  readonly id: string;
  readonly title: string;
  readonly status: "pending" | "active" | "done";
  /** Short hash of its commit, found through its trailer. */
  readonly commit?: string;
  readonly summary?: string;
}

/** A change as `specty audit` reports it (ARCHITECTURE §13): what its files, git and audit keep. */
export interface AuditView {
  readonly id: string;
  readonly title: string;
  readonly kind: ChangeKind;
  readonly phase: Phase;
  readonly branch?: string;
  /** The user's literal request (`new --request`). */
  readonly request?: string;
  readonly approved?: {
    readonly revision: number;
    readonly at: string;
    readonly by: string;
    readonly channel: string;
  };
  readonly tasks: readonly AuditTask[];
  /** Oldest first. */
  readonly events: readonly AuditEvent[];
}

type T = (es: string, en: string) => string;

/** The audit report: Markdown for people, and the same as data for `--json`. */
export function auditReport(
  view: AuditView,
  lang: Lang,
): { readonly markdown: string; readonly json: unknown } {
  const t = translator(lang);
  const { tasks, events, ...change } = view;
  const markdown = [
    ...headerLines(view, t),
    "",
    ...taskLines(tasks, t),
    "",
    ...timelineLines(events, t),
    "",
  ].join("\n");
  return { markdown, json: { change, tasks, events } };
}

/** The title and the facts of the change: id, kind, phase, branch, request and approval. */
function headerLines(view: AuditView, t: T): string[] {
  const { approved } = view;
  return [
    t(`# Auditoría: ${view.title}`, `# Audit: ${view.title}`),
    "",
    t(
      `- Cambio: \`${view.id}\` · ${view.kind} · fase ${view.phase}`,
      `- Change: \`${view.id}\` · ${view.kind} · phase ${view.phase}`,
    ),
    ...(view.branch === undefined
      ? []
      : [t(`- Rama: \`${view.branch}\``, `- Branch: \`${view.branch}\``)]),
    ...(view.request === undefined
      ? []
      : [t(`- Petición: «${view.request}»`, `- Request: “${view.request}”`)]),
    ...(approved === undefined
      ? []
      : [
          t(
            `- Aprobada: revisión ${approved.revision}, ${when(approved.at)}, por ${approved.by} (${approved.channel})`,
            `- Approved: revision ${approved.revision}, ${when(approved.at)}, by ${approved.by} (${approved.channel})`,
          ),
        ]),
  ];
}

function taskLines(tasks: readonly AuditTask[], t: T): string[] {
  const status = {
    pending: t("pendiente", "pending"),
    active: t("en curso", "in progress"),
    done: t("hecha", "done"),
  };
  return [
    t("## Tareas", "## Tasks"),
    "",
    ...(tasks.length === 0
      ? [t("Sin tareas.", "No tasks.")]
      : [
          t("| Tarea | Estado | Commit | Resumen |", "| Task | Status | Commit | Summary |"),
          "| --- | --- | --- | --- |",
          ...tasks.map(
            (task) =>
              `| ${cell(`${task.id} ${task.title}`)} | ${status[task.status]} | ${task.commit ?? "—"} | ${cell(task.summary ?? "—")} |`,
          ),
        ]),
  ];
}

function timelineLines(events: readonly AuditEvent[], t: T): string[] {
  return [
    t("## Línea de tiempo", "## Timeline"),
    "",
    t("| Cuándo | Quién | Qué |", "| When | Who | What |"),
    "| --- | --- | --- |",
    ...events.map(
      (entry) => `| ${when(entry.ts)} | ${cell(who(entry, t))} | ${cell(what(entry, t))} |`,
    ),
  ];
}

/** `2026-10-24 10:10`, from an ISO time. */
function when(ts: string): string {
  return ts.slice(0, 16).replace("T", " ");
}

/** A table cell: one line, with its pipes escaped. */
function cell(text: string): string {
  return text.replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|");
}

function who(entry: AuditEvent, t: T): string {
  if (entry.data.delegated === true) return t("agente, por delegación", "agent, delegated");
  if (entry.actor === "agent") {
    const agent = t("agente", "agent");
    return entry.tool === undefined ? agent : `${agent} (${entry.tool})`;
  }
  return entry.actor === "human" ? t("persona", "person") : entry.actor;
}

/** What the words of an event need: the translator and the event's data, read as text. */
interface EventWords {
  readonly t: T;
  /** The string at `key`, or "". */
  text(key: string): string;
  /** Any value at `key`, or "—". */
  value(key: string): string;
  /** `: <the string at key>`, or nothing without it. */
  after(key: string): string;
  /** The command an event ran, with its exit code and its duration. */
  ran(): string;
}

/** Each event of formats.md §4 in words. */
const EVENTS: Readonly<Record<string, (words: EventWords) => string>> = {
  "change.created": ({ t, text }) =>
    t("Creó el cambio", "Created the change") + (text("kind") === "" ? "" : ` (${text("kind")})`),
  "spec.proposed": ({ t, value }) =>
    t(`Propuso la revisión ${value("revision")}`, `Proposed revision ${value("revision")}`),
  "assumption.decided": ({ t }) => t("Decidió los supuestos", "Decided the assumptions"),
  "review.changes_requested": ({ t, value }) =>
    t(
      `Pidió cambios en la revisión ${value("revision")}`,
      `Asked for changes to revision ${value("revision")}`,
    ),
  "spec.approved": ({ t, text, value }) =>
    t(`Aprobó la revisión ${value("revision")}`, `Approved revision ${value("revision")}`) +
    (text("channel") === "" ? "" : ` (${text("channel")})`),
  "tests.proposed": ({ t, value }) =>
    t(`Envió ${value("count")} tests para aprobar`, `Sent ${value("count")} tests for approval`),
  "tests.locked": ({ t, value }) =>
    t(`Bloqueó ${value("count")} tests en rojo`, `Locked ${value("count")} red tests`),
  "tests.approved": ({ t, text }) =>
    t("Aprobó los tests", "Approved the tests") +
    (text("channel") === "" ? "" : ` (${text("channel")})`),
  "task.started": ({ t, text }) => t(`Empezó ${text("task")}`, `Started ${text("task")}`),
  "task.verified": ({ t, text, ran }) =>
    t(`Verificó ${text("task")}: `, `Verified ${text("task")}: `) + ran(),
  "task.completed": ({ t, text, after }) =>
    t(`Completó ${text("task")}`, `Completed ${text("task")}`) + after("summary"),
  "scope.requested": ({ t, text, after }) =>
    `${t(
      `Pidió ampliar el alcance de ${text("task")}`,
      `Asked to widen the scope of ${text("task")}`,
    )} (${text("id")})${after("reason")}`,
  "scope.decided": ({ t, text, value }) =>
    t(`Decidió ${text("id")}: ${value("decision")}`, `Decided ${text("id")}: ${value("decision")}`),
  "epic.slicesDone": ({ t }) => t("Todos los cortes quedaron cerrados", "Every slice was closed"),
  "adjust.requested": ({ t, after }) =>
    t("Pidió un ajuste", "Asked for an adjustment") + after("request"),
  "adjust.classified": ({ t }) => t("Clasificó el ajuste", "Classified the adjustment"),
  "review.completed": ({ t, text, value }) =>
    (text("target") === "spec"
      ? t("Revisión independiente de la spec", "Independent review of the spec")
      : t("Revisión independiente del resultado", "Independent review of the result")) +
    t(`: código ${value("exit")}`, `: code ${value("exit")}`),
  "change.verified": ({ t, ran }) => t("Verificación completa: ", "Full verification: ") + ran(),
  "change.accepted": ({ t }) => t("Aceptó el resultado", "Accepted the result"),
  "retro.confirmed": ({ t }) => t("Confirmó la retro", "Confirmed the retro"),
  "change.closed": ({ t }) => t("Cerró el cambio", "Closed the change"),
  "change.cancelled": ({ t, after }) =>
    t("Canceló el cambio", "Cancelled the change") + after("reason"),
  "integration.started": ({ t, text }) =>
    t(`Empezó a incorporar ${text("target")}`, `Started bringing in ${text("target")}`),
  "integration.resolved": ({ t }) => t("Resolvió la incorporación", "Resolved the incorporation"),
  "integration.abandoned": ({ t }) => t("Abandonó la incorporación", "Abandoned the incorporation"),
};

/** Each event of formats.md §4 in words; one Specty does not know yet, by its name. */
function what(entry: AuditEvent, t: T): string {
  const words = lookup(EVENTS, entry.event);
  return words === undefined ? entry.event : words(eventWords(entry.data, t));
}

function eventWords(data: AuditEvent["data"], t: T): EventWords {
  const text = (key: string) => (typeof data[key] === "string" ? String(data[key]) : "");
  const value = (key: string) =>
    data[key] === undefined || data[key] === null ? "—" : String(data[key]);
  return {
    t,
    text,
    value,
    after: (key) => (text(key) === "" ? "" : `: ${text(key)}`),
    ran: () =>
      t(
        `\`${text("cmd")}\`, código ${value("exit")}, ${duration(data.ms)}`,
        `\`${text("cmd")}\`, code ${value("exit")}, ${duration(data.ms)}`,
      ),
  };
}

/** `2 min 5 s` or `41 s`, from milliseconds. */
function duration(ms: unknown): string {
  if (typeof ms !== "number") return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const rest = seconds % 60;
  return rest === 0
    ? `${Math.floor(seconds / 60)} min`
    : `${Math.floor(seconds / 60)} min ${rest} s`;
}

/** Why `specty audit` reports nothing: no change is active here, or none has that id. */
export type AuditRefusal =
  | { readonly reason: "no-active" }
  | { readonly reason: "no-change"; readonly id: string };

export function auditRefusalCard(refusal: AuditRefusal, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const { command } = ctx;
  return {
    status: "invalid",
    header: headerOf("audit"),
    blocks: section(undefined, [
      refusal.reason === "no-active"
        ? t("No hay un cambio activo en esta carpeta.", "There is no active change in this folder.")
        : t(`No hay ningún cambio ${refusal.id}.`, `There is no change ${refusal.id}.`),
    ]),
    next: t(
      `di cuál con \`${command} audit <id>\`; \`${command} status\` lista los abiertos.`,
      `name it with \`${command} audit <id>\`; \`${command} status\` lists the open ones.`,
    ),
  };
}
