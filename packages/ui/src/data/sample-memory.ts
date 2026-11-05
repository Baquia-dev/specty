// SPDX-License-Identifier: Apache-2.0
// Specty's memory in the prototype (ADR 0016): an entry of every kind and status, and open changes
// held by an agent, waiting for the person and orphaned, as `GET /api/memory` gives them.
import type { MemoryEntry } from "@baquia-dev/specty-core";
import type { MemoryRecord } from "./records";
import type { MemoryVerb } from "./source";

const CLOSED = { at: "2026-11-03T12:00:00.000Z", by: "person" };

export function sampleMemory(): MemoryRecord {
  return { entries: ENTRIES, changes: CHANGES };
}

const ENTRIES: MemoryRecord["entries"] = [
  {
    id: "P1",
    kind: "pending",
    status: "open",
    created: "2026-11-01T10:00:00.000Z",
    origin: { by: "claude-code" },
    text: "Un --kind desconocido en specty memory add lo rechaza commander con su mensaje en inglés.",
  },
  {
    id: "P6",
    kind: "improvement",
    status: "open",
    created: "2026-11-02T10:00:00.000Z",
    origin: { change: "20261103-memoria-tarjeta-de-inicio-2", by: "claude-code" },
    text: "Con policy.tests: contract, un ajuste por un fallo que solo es de tipos no puede tener un test rojo.",
  },
  {
    id: "P10",
    kind: "pending",
    status: "taken",
    created: "2026-11-03T08:00:00.000Z",
    origin: { by: "claude-code" },
    taken: { change: "20261104-test-ui-estable", at: "2026-11-04T08:00:00.000Z" },
    text: "El test «starting the UI» de la extensión de VS Code falla a veces dentro de pnpm check.",
  },
  {
    id: "P15",
    kind: "pending",
    status: "open",
    created: "2026-11-03T09:00:00.000Z",
    origin: { change: "20261103-sin-permisos-devin-cursor", by: "person" },
    text: "Mover las worktrees dentro del proyecto y las exclusiones de cada agente.",
  },
  {
    id: "P18",
    kind: "pending",
    status: "drop-proposed",
    created: "2026-11-03T10:00:00.000Z",
    origin: { change: "20261103-sin-permisos-devin-cursor", by: "person" },
    drop: { reason: "Duplica P15.", by: "claude-code", at: "2026-11-03T11:00:00.000Z" },
    text: "Mover las worktrees dentro del proyecto y las exclusiones de cada agente, con su permiso.",
  },
  {
    id: "P19",
    kind: "reminder",
    status: "open",
    created: "2026-11-03T11:00:00.000Z",
    origin: { by: "claude-code" },
    text: "Recompilar el dist de main después de cada cierre.",
  },
  {
    id: "P20",
    kind: "pending",
    status: "done",
    created: "2026-11-03T12:00:00.000Z",
    origin: { by: "claude-code" },
    closed: CLOSED,
    text: "Instalar la red de la memoria en el fin de turno.",
  },
  {
    id: "D1",
    kind: "decision",
    status: "open",
    created: "2026-10-30T10:00:00.000Z",
    origin: { by: "person" },
    quote: "la que tú recomiendas",
    text: "La memoria duradera vive en su propia rama, specty-memory.",
  },
];

const CHANGES: MemoryRecord["changes"] = [
  {
    id: "20261030-memoria-de-specty",
    kind: "epic",
    phase: "implementing",
    title: "Memoria de Specty: sesiones, pendientes y trabajo sin duplicar",
    waitingFor: "agent",
    current: true,
    pendingScope: [],
    holder: { tool: "claude-code", ago: 2 },
  },
  {
    id: "20261103-sin-permisos-devin-cursor",
    kind: "standard",
    phase: "acceptance",
    title: "Devin y Cursor sin permisos en la carpeta del usuario",
    waitingFor: "human",
    current: false,
    pendingScope: [],
    folder: "../specty.worktrees/20261103-sin-permisos-devin-cursor",
    holder: { tool: "codex", ago: 12 },
  },
  {
    id: "20261029-tooltip-con-contexto",
    kind: "standard",
    phase: "implementing",
    title: "Tooltip con contexto en siglas de items de la UI",
    waitingFor: "agent",
    current: false,
    pendingScope: [],
    folder: "../specty.worktrees/20261029-tooltip-con-contexto",
    orphan: true,
  },
];

/** `entry` once the person decides on it in the prototype: dropped, kept or done. */
export function decidedIn(
  entry: MemoryEntry,
  verb: MemoryVerb,
  reason: string | undefined,
  at: string,
): MemoryEntry {
  const closed = { at, by: "person" };
  if (verb === "done") return { ...entry, status: "done", closed };
  if (verb === "drop") {
    const why = reason !== undefined && reason !== "" ? reason : (entry.drop?.reason ?? "");
    return { ...entry, status: "dropped", drop: { reason: why, by: "person", at }, closed };
  }
  const { drop: _drop, ...kept } = entry;
  return { ...kept, status: "open" };
}
