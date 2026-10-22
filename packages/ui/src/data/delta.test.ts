// SPDX-License-Identifier: Apache-2.0
import { type ChangeState, parseSpec } from "@baquia-dev/specty-core";
import { deriveDelta, readable, wordDiff } from "./delta";
import type { DiffPart } from "./records";
import { deriveView } from "./views";

const APPROVED = `# Justificar faltas desde la app

## Objetivo

La familia justifica una falta desde la app.

## Fuera de alcance

- Ninguno

## Supuestos

- A1: El colegio acepta justificantes digitales.
  - impacto: alto
- A2: Basta con una foto del justificante.

## Criterios de aceptación

- AC1: CUANDO la familia envía un justificante ENTONCES la falta queda pendiente de revisión.
- AC2: CUANDO el tutor lo acepta ENTONCES la falta queda justificada.

## Archivos

- crear lib/absences/justify.dart — formulario
- modificar lib/absences/list.dart — botón para justificar

## Tareas

- [x] T1: Formulario de justificante
  - files: lib/absences/justify.dart
  - ac: AC1
- [ ] T2: Botón en la lista
  - files: lib/absences/list.dart
  - ac: AC2

## Riesgos

- R1: Las fotos pesan demasiado.
`;

const CURRENT = APPROVED.replace(
  "justifica una falta desde la app.",
  "justifica una falta desde la app, con una foto o un PDF.",
)
  .replace("Basta con una foto del justificante.", "Basta con una foto o un PDF del justificante.")
  .replace(
    "- AC2: CUANDO el tutor lo acepta ENTONCES la falta queda justificada.",
    "- AC2: CUANDO el tutor lo acepta ENTONCES la falta queda justificada y la familia recibe un aviso.\n- AC3: CUANDO el tutor lo rechaza ENTONCES la familia ve el motivo.",
  )
  .replace(
    "- modificar lib/absences/list.dart — botón para justificar",
    "- modificar lib/absences/list.dart — botón para justificar\n- crear lib/notifications/push.dart — aviso a la familia",
  )
  .replace(
    "  - ac: AC2\n",
    "  - ac: AC2\n- [ ] T3: Avisar a la familia\n  - files: lib/notifications/push.dart\n  - ac: AC2, AC3\n",
  )
  .replace("- R1: Las fotos pesan demasiado.", "- R2: Un PDF puede traer contenido malicioso.");

const changed = (parts: readonly DiffPart[], change: DiffPart["change"]) =>
  parts
    .filter((part) => part.change === change)
    .map((part) => part.text)
    .join("|");

function state(overrides: Partial<ChangeState> = {}): ChangeState {
  return {
    schema: 1,
    id: "20261016-justificar-faltas",
    kind: "standard",
    phase: "review",
    revision: 3,
    approved: {
      revision: 2,
      hash: `sha256:${"b".repeat(64)}`,
      at: "2026-10-16T10:00:00.000Z",
      by: "Ana Gómez",
      channel: "ui",
    },
    items: {},
    tasks: { T1: { status: "done", attempts: 1, scopeExtra: [] } },
    pending: { scopeRequests: [], adjustment: null },
    maxIds: {},
    ...overrides,
  };
}

describe("wordDiff", () => {
  it("keeps what did not change and marks the words removed and added (AC2)", () => {
    const parts = wordDiff("La página carga rápido.", "La página carga en menos de 2 s.");
    expect(parts[0]).toEqual({ text: "La página carga " });
    expect(changed(parts, "removed")).toBe("rápido.");
    expect(changed(parts, "added")).toBe("en menos de 2 s.");
  });

  it("returns one unchanged part for equal texts, and only additions from nothing", () => {
    expect(wordDiff("Igual que antes.", "Igual que antes.")).toEqual([
      { text: "Igual que antes." },
    ]);
    expect(wordDiff("", "Nuevo")).toEqual([{ text: "Nuevo", change: "added" }]);
  });

  it("shows a very long text whole, removed and then added", () => {
    const long = "palabra ".repeat(400);
    expect(wordDiff(long, `${long}más`)).toEqual([
      { text: long, change: "removed" },
      { text: `${long}más`, change: "added" },
    ]);
  });
});

describe("readable", () => {
  it("drops the list marker, the checkbox and the id, and the indent of sub-items", () => {
    expect(readable("- [ ] T3: Avisar\n  - files: lib/a.dart\n  - ac: AC2")).toBe(
      "Avisar\nfiles: lib/a.dart\nac: AC2",
    );
    expect(readable("- A2: Basta con una foto.\n  - impacto: alto")).toBe(
      "Basta con una foto.\nimpacto: alto",
    );
    expect(readable("- crear lib/a.dart — aviso")).toBe("crear lib/a.dart — aviso");
    expect(readable("Texto de una sección.")).toBe("Texto de una sección.");
  });
});

describe("deriveDelta", () => {
  const delta = deriveDelta(parseSpec(CURRENT).spec, parseSpec(APPROVED).spec, 2);

  it("lists what was added, removed and modified, in the order of the document (AC1)", () => {
    expect(delta.approvedRevision).toBe(2);
    expect(delta.entries.map((entry) => `${entry.change} ${entry.section} ${entry.key}`)).toEqual([
      "modified goal goal",
      "modified assumptions A2",
      "modified criteria AC2",
      "added criteria AC3",
      "added files lib/notifications/push.dart",
      "added tasks T3",
      "removed risks R1",
      "added risks R2",
    ]);
  });

  it("diffs modified units by word and shows added and removed ones whole (AC2)", () => {
    const entry = (key: string) => delta.entries.find((candidate) => candidate.key === key);
    expect(changed(entry("A2")?.diff ?? [], "added")).toBe("o un PDF ");
    expect(changed(entry("A2")?.diff ?? [], "removed")).toBe("");
    expect(changed(entry("goal")?.diff ?? [], "removed")).toBe("app.");
    expect(entry("AC3")?.diff).toEqual([
      { text: "CUANDO el tutor lo rechaza ENTONCES la familia ve el motivo.", change: "added" },
    ]);
    expect(entry("R1")?.diff).toEqual([{ text: "Las fotos pesan demasiado.", change: "removed" }]);
  });

  it("marks a new task that touches files the approved revision did not list (AC3)", () => {
    const task = delta.entries.find((entry) => entry.key === "T3");
    expect(task?.newScope).toHaveLength(1);
    expect(task?.newScope[0]?.es).toContain("lib/notifications/push.dart");
    expect(task?.newScope[0]?.es).toContain("alcance nuevo");
    expect(task?.newScope[0]?.en).toContain("lib/notifications/push.dart");
    expect(delta.entries.filter((entry) => entry.newScope.length > 0)).toHaveLength(1);
  });
});

describe("the delta in the view", () => {
  it("comes only in review, with an approved revision and its text (AC1, AC5)", () => {
    const record = { spec: CURRENT, phaseSince: "2026-10-22T10:00:00.000Z" };
    const review = (overrides: Partial<ChangeState>, approvedSpec?: string) =>
      deriveView({
        ...record,
        state: state(overrides),
        ...(approvedSpec === undefined ? {} : { approvedSpec }),
      }).review;
    expect(review({}, APPROVED).delta?.entries).toHaveLength(8);
    expect(review({}).delta).toBeUndefined();
    expect(review({ phase: "implementing" }, APPROVED).delta).toBeUndefined();
    expect(review({ approved: undefined }, APPROVED).delta).toBeUndefined();
  });
});
