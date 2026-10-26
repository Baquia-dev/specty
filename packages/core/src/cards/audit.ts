// SPDX-License-Identifier: Apache-2.0
import type { Phase } from "../flow/phases";
import type { Lang } from "../i18n";
import type { ChangeKind } from "../spec/model";
import { translator } from "./text";

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
  const { approved } = view;
  const status = {
    pending: t("pendiente", "pending"),
    active: t("en curso", "in progress"),
    done: t("hecha", "done"),
  };
  const markdown = [
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
    "",
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
    "",
    t("## Línea de tiempo", "## Timeline"),
    "",
    t("| Cuándo | Quién | Qué |", "| When | Who | What |"),
    "| --- | --- | --- |",
    ...events.map(
      (entry) => `| ${when(entry.ts)} | ${cell(who(entry, t))} | ${cell(what(entry, t))} |`,
    ),
    "",
  ].join("\n");
  return { markdown, json: { change, tasks, events } };
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

/** Each event of formats.md §4 in words; one Specty does not know yet, by its name. */
function what(entry: AuditEvent, t: T): string {
  const { data } = entry;
  const text = (key: string) => (typeof data[key] === "string" ? String(data[key]) : "");
  const value = (key: string) =>
    data[key] === undefined || data[key] === null ? "—" : String(data[key]);
  const after = (key: string) => (text(key) === "" ? "" : `: ${text(key)}`);
  const ran = () =>
    t(
      `\`${text("cmd")}\`, código ${value("exit")}, ${duration(data.ms)}`,
      `\`${text("cmd")}\`, code ${value("exit")}, ${duration(data.ms)}`,
    );
  switch (entry.event) {
    case "change.created":
      return (
        t("Creó el cambio", "Created the change") +
        (text("kind") === "" ? "" : ` (${text("kind")})`)
      );
    case "spec.proposed":
      return t(
        `Propuso la revisión ${value("revision")}`,
        `Proposed revision ${value("revision")}`,
      );
    case "assumption.decided":
      return t("Decidió los supuestos", "Decided the assumptions");
    case "review.changes_requested":
      return t(
        `Pidió cambios en la revisión ${value("revision")}`,
        `Asked for changes to revision ${value("revision")}`,
      );
    case "spec.approved": {
      const channel = text("channel") === "" ? "" : ` (${text("channel")})`;
      return (
        t(`Aprobó la revisión ${value("revision")}`, `Approved revision ${value("revision")}`) +
        channel
      );
    }
    case "task.started":
      return t(`Empezó ${text("task")}`, `Started ${text("task")}`);
    case "task.verified":
      return t(`Verificó ${text("task")}: `, `Verified ${text("task")}: `) + ran();
    case "task.completed":
      return t(`Completó ${text("task")}`, `Completed ${text("task")}`) + after("summary");
    case "scope.requested":
      return (
        t(
          `Pidió ampliar el alcance de ${text("task")}`,
          `Asked to widen the scope of ${text("task")}`,
        ) + ` (${text("id")})${after("reason")}`
      );
    case "scope.decided":
      return t(
        `Decidió ${text("id")}: ${value("decision")}`,
        `Decided ${text("id")}: ${value("decision")}`,
      );
    case "epic.slicesDone":
      return t("Todos los cortes quedaron cerrados", "Every slice was closed");
    case "adjust.requested":
      return t("Pidió un ajuste", "Asked for an adjustment") + after("request");
    case "adjust.classified":
      return t("Clasificó el ajuste", "Classified the adjustment");
    case "review.completed":
      return (
        (text("target") === "spec"
          ? t("Revisión independiente de la spec", "Independent review of the spec")
          : t("Revisión independiente del resultado", "Independent review of the result")) +
        t(`: código ${value("exit")}`, `: code ${value("exit")}`)
      );
    case "change.verified":
      return t("Verificación completa: ", "Full verification: ") + ran();
    case "change.accepted":
      return t("Aceptó el resultado", "Accepted the result");
    case "retro.confirmed":
      return t("Confirmó la retro", "Confirmed the retro");
    case "change.closed":
      return t("Cerró el cambio", "Closed the change");
    case "change.cancelled":
      return t("Canceló el cambio", "Cancelled the change") + after("reason");
    case "integration.started":
      return t(`Empezó a incorporar ${text("target")}`, `Started bringing in ${text("target")}`);
    case "integration.resolved":
      return t("Resolvió la incorporación", "Resolved the incorporation");
    case "integration.abandoned":
      return t("Abandonó la incorporación", "Abandoned the incorporation");
    default:
      return entry.event;
  }
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
