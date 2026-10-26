// SPDX-License-Identifier: Apache-2.0
// A change's history (docs/ui.md, Historial): the events of `audit.jsonl` (formats.md §4) as a
// timeline that reads, each with its type to filter by. Pure: it runs in the derivation worker.
// The events come from disk and from older versions of the CLI: every field is read with care.
import {
  both,
  count,
  counted,
  type Data,
  isData,
  onTask,
  plain,
  text,
  texts,
  when,
} from "./history-text";
import { type AuditRecord, formatDuration } from "./progress";
import type { Bilingual } from "./records";

type HistoryType =
  | "spec"
  | "tasks"
  | "verifications"
  | "scope"
  | "adjustments"
  | "closing"
  | "other";

export interface HistoryEntry {
  /** ISO time of the event. */
  readonly at: string;
  readonly actor: AuditRecord["actor"];
  /** The tool the agent declared: context, not proof. */
  readonly tool?: string;
  /** The event as `audit.jsonl` names it. */
  readonly event: string;
  readonly type: HistoryType;
  readonly title: Bilingual;
  readonly details: readonly Bilingual[];
}

interface Told {
  readonly type: HistoryType;
  readonly title: Bilingual;
  readonly details?: readonly (Bilingual | undefined)[];
}

/** A decision of the person that their agent took, in delegated mode (ADR 0010). */
const DELEGATED = both("Por delegación: lo decidió el agente", "Delegated: the agent decided");

const LANES: Readonly<Record<string, Bilingual>> = {
  standard: both("Carril estándar", "Standard lane"),
  quick: both("Cambio rápido", "Quick change"),
  epic: both("Épica", "Epic"),
  retro: both("Retro: código ya escrito", "Retro: code already written"),
};

const CHANNELS: Readonly<Record<string, Bilingual>> = {
  ui: both("Desde la UI", "From the UI"),
  tty: both("En la terminal", "In the terminal"),
  pr: both("En una pull request", "In a pull request"),
};

/** «la revisión 3», or «la spec» when the event does not say which. */
const revisionOf = (data: Data) => {
  const revision = count(data, "revision");
  return revision === undefined
    ? both("la spec", "the spec")
    : both(`la revisión ${revision}`, `revision ${revision}`);
};

function verification(data: Data, of: Bilingual, full: boolean): Told {
  const exit = count(data, "exit");
  const ms = count(data, "ms");
  const passed = exit === 0;
  const verdict =
    exit === undefined
      ? both("", "")
      : passed
        ? both(" correcta", " passed")
        : both(" fallida", " failed");
  return {
    type: "verifications",
    title: both(`${of.es}${verdict.es}`, `${of.en}${verdict.en}`),
    details: [
      ms === undefined ? undefined : both(formatDuration(ms, "es"), formatDuration(ms, "en")),
      plain(text(data, "cmd")),
      exit === undefined || passed || full
        ? undefined
        : both(`Código de salida ${exit}`, `Exit code ${exit}`),
    ],
  };
}

const pathsOf = (data: Data) => plain(texts(data, "paths").join(", ") || undefined);

/** A scope request, as the CLI writes it (the whole request) or as older events do (its id). */
function requestOf(data: Data): Data {
  const { request } = data;
  return isData(request) ? request : { ...data, id: text(data, "request") ?? text(data, "id") };
}

const TELL: Readonly<Record<string, (data: Data) => Told>> = {
  "change.created": (data) => ({
    type: "spec",
    title: both("Creó el cambio", "Created the change"),
    details: [
      LANES[text(data, "kind") ?? text(data, "lane") ?? ""],
      when(text(data, "branch"), (branch) => both(`Rama ${branch}`, `Branch ${branch}`)),
      ...texts(data, "follows").map((id) => both(`Sigue a ${id}`, `Follows ${id}`)),
    ],
  }),
  "spec.proposed": (data) => {
    const of = revisionOf(data);
    return {
      type: "spec",
      title: both(`Propuso ${of.es}`, `Proposed ${of.en}`),
      details: [
        when(text(data, "size"), (size) => both(`Tamaño ${size}`, `Size ${size}`)),
        counted(count(data, "warnings") ?? 0, "aviso", "warning"),
      ],
    };
  },
  "assumption.decided": (data) => {
    const item = text(data, "item") ?? "";
    const rejected = texts(data, "rejected");
    const decision = text(data, "decision");
    if (rejected.length > 0) {
      const items = rejected.join(", ");
      return { type: "spec", title: both(`Rechazó ${items}`, `Rejected ${items}`) };
    }
    const title =
      decision === "confirmed"
        ? both(`Confirmó ${item}`, `Confirmed ${item}`)
        : decision === "rejected"
          ? both(`Rechazó ${item}`, `Rejected ${item}`)
          : both(`Decidió ${item}`.trim(), `Decided ${item}`.trim());
    return { type: "spec", title, details: [plain(text(data, "comment"))] };
  },
  "review.changes_requested": (data) => {
    const of = revisionOf(data);
    return {
      type: "spec",
      title: both(`Pidió cambios en ${of.es}`, `Asked for changes to ${of.en}`),
      details: [counted(texts(data, "comments").length, "comentario", "comment")],
    };
  },
  "spec.approved": (data) => {
    const of = revisionOf(data);
    return {
      type: "spec",
      title: both(`Aprobó ${of.es}`, `Approved ${of.en}`),
      details: [CHANNELS[text(data, "channel") ?? ""]],
    };
  },
  "task.started": (data) => ({
    type: "tasks",
    title: onTask(data, "Empezó", "Started"),
    details: [
      when(text(data, "baseCommit"), (commit) => both(`Desde ${commit}`, `From ${commit}`)),
    ],
  }),
  "task.verified": (data) => {
    const task = text(data, "task");
    const of =
      task === undefined
        ? both("Verificación", "Verification")
        : both(`${task}: verificación`, `${task}: verification`);
    return verification(data, of, false);
  },
  "task.completed": (data) => ({
    type: "tasks",
    title: onTask(data, "Terminó", "Finished"),
    details: [
      when(text(data, "commit"), (commit) => both(`Commit ${commit}`, `Commit ${commit}`)),
      plain(text(data, "summary")),
    ],
  }),
  "scope.requested": (data) => {
    const request = requestOf(data);
    const task = text(request, "task");
    const id = text(request, "id");
    return {
      type: "scope",
      title: both(
        task === undefined ? "Pidió ampliar el alcance" : `Pidió ampliar el alcance de ${task}`,
        task === undefined ? "Asked to widen the scope" : `Asked to widen ${task}'s scope`,
      ),
      details: [plain(id), pathsOf(request), plain(text(request, "reason"))],
    };
  },
  "scope.decided": (data) => {
    const id = text(data, "id") ?? text(data, "request");
    const decision = text(data, "decision");
    const what =
      id === undefined
        ? both("la ampliación del alcance", "the scope widening")
        : both(`la solicitud ${id}`, `request ${id}`);
    const title =
      decision === "rejected"
        ? both(`Rechazó ${what.es}`, `Rejected ${what.en}`)
        : decision === "auto"
          ? both(
              "Aprobó la ampliación por la política del proyecto",
              "Approved the widening by the project's policy",
            )
          : both(`Aprobó ${what.es}`, `Approved ${what.en}`);
    return {
      type: "scope",
      title,
      details: [pathsOf(data), plain(text(data, "reason"))],
    };
  },
  "adjust.requested": (data) => ({
    type: "adjustments",
    title: both("Pidió ajustes", "Asked for adjustments"),
    details: [plain(text(data, "request"))],
  }),
  "adjust.classified": () => ({
    type: "adjustments",
    title: both("Clasificó los ajustes", "Classified the adjustments"),
  }),
  "change.verified": (data) =>
    verification(data, both("Verificación completa", "Full verification"), true),
  "change.accepted": (data) => ({
    type: "closing",
    title: both("Aceptó el resultado", "Accepted the result"),
    details: [
      when(count(data, "revision")?.toString(), (revision) =>
        both(`Revisión ${revision}`, `Revision ${revision}`),
      ),
    ],
  }),
  "change.closed": (data) => ({
    type: "closing",
    title: both("Cerró el cambio", "Closed the change"),
    details: [
      text(data, "lane") === "quick"
        ? both("Cambio rápido: se cierra al aceptarlo", "Quick change: accepting closes it")
        : undefined,
    ],
  }),
  "change.cancelled": (data) => ({
    type: "closing",
    title: both("Canceló el cambio", "Cancelled the change"),
    details: [plain(text(data, "reason"))],
  }),
  "retro.confirmed": (data) => ({
    type: "closing",
    title: both("Confirmó la retro", "Confirmed the retro"),
    details: [
      text(data, "mode") === "minimal"
        ? both("Mínima: solo el índice", "Minimal: the index only")
        : undefined,
    ],
  }),
};

/** After accepting, a proposal is the closing the agent sends (`specty propose` in closing). */
const CLOSING_SENT: Told = { type: "closing", title: both("Envió el cierre", "Sent the closing") };

/** The events, oldest first, as `audit.jsonl` has them; an unknown one keeps its name. */
export function historyOf(audit: readonly AuditRecord[]): readonly HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  let accepted = false;
  for (const { ts, actor, tool, event, data } of audit) {
    const told =
      event === "spec.proposed" && accepted
        ? CLOSING_SENT
        : (TELL[event]?.(data ?? {}) ?? { type: "other", title: both(event, event) });
    if (event === "change.accepted") accepted = true;
    entries.push({
      at: ts,
      actor,
      ...(tool === undefined ? {} : { tool }),
      event,
      type: told.type,
      title: told.title,
      details: [...(told.details ?? []), data?.delegated === true ? DELEGATED : undefined].filter(
        (detail): detail is Bilingual => detail !== undefined,
      ),
    });
  }
  return entries;
}
