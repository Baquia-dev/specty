// SPDX-License-Identifier: Apache-2.0
import { type ChangeState, parseSpec } from "@baquia-dev/specty-core";
import { deriveDelta, readable, textAndBefore, wordDiff } from "./delta";
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
  it("keeps what did not change and marks the words removed and added (AC1)", () => {
    const parts = wordDiff("La página carga rápido.", "La página carga en menos de 2 s.");
    expect(parts[0]).toEqual({ text: "La página carga " });
    expect(changed(parts, "removed")).toBe("rápido");
    expect(changed(parts, "added")).toBe("en menos de 2 s");
    // Punctuation is a token of its own: the final period is kept, not removed and added.
    expect(parts.at(-1)).toEqual({ text: "." });
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

describe("textAndBefore", () => {
  it("gives the final text with the additions, and no «Antes» when nothing was removed (AC1)", () => {
    expect(textAndBefore("queda justificada.", "queda justificada y avisa.")).toEqual({
      text: [{ text: "queda justificada" }, { text: " y avisa", change: "added" }, { text: "." }],
    });
  });

  it("adds «Antes» with the removed words only when something was removed (AC1)", () => {
    const { text, before } = textAndBefore(
      "Basta con una foto; no hace falta el original.",
      "Basta con una foto o un PDF; el original ya no se pide.",
    );
    expect(changed(text, "added")).toBe(" o un PDF;| ya no se pide");
    expect(changed(text, "removed")).toBe("");
    expect(text.map((part) => part.text).join("")).toBe(
      "Basta con una foto o un PDF; el original ya no se pide.",
    );
    expect(changed(before ?? [], "removed")).toBe("; no hace falta");
    expect((before ?? []).map((part) => part.text).join("")).toBe(
      "Basta con una foto; no hace falta el original.",
    );
  });
});

describe("readable", () => {
  it("drops the list marker, the checkbox and the id, and the indent of sub-items", () => {
    expect(readable("- [ ] T3: Avisar\n  - files: lib/a.dart\n  - ac: AC2")).toBe(
      "Avisar\nfiles: lib/a.dart\nac: AC2",
    );
    expect(readable("- crear lib/a.dart — aviso")).toBe("crear lib/a.dart — aviso");
    expect(readable("Texto de una sección.")).toBe("Texto de una sección.");
  });
});

describe("deriveDelta", () => {
  const delta = deriveDelta(parseSpec(CURRENT).spec, parseSpec(APPROVED).spec, 2);
  const entry = (key: string) => delta.entries.find((candidate) => candidate.key === key);

  it("lists what was added, removed and modified, in the order of the document (AC1)", () => {
    expect(delta.approvedRevision).toBe(2);
    expect(delta.entries.map((item) => `${item.change} ${item.section} ${item.key}`)).toEqual([
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

  it("shows the final text of modified items, with the additions and no repeated words (AC1)", () => {
    expect(changed(entry("A2")?.text ?? [], "added")).toBe("o un PDF ");
    expect(entry("A2")?.before).toBeUndefined();
    expect(entry("AC2")?.text).toEqual([
      { text: "CUANDO el tutor lo acepta ENTONCES la falta queda justificada" },
      { text: " y la familia recibe un aviso", change: "added" },
      { text: "." },
    ]);
    expect(changed(entry("goal")?.text ?? [], "added")).toBe(", con una foto o un PDF");
  });

  it("shows added and removed items as plain text: their mark tells what happened (AC2)", () => {
    expect(entry("AC3")?.text).toEqual([
      { text: "CUANDO el tutor lo rechaza ENTONCES la familia ve el motivo." },
    ]);
    expect(entry("R1")?.text).toEqual([{ text: "Las fotos pesan demasiado." }]);
    expect(entry("T3")?.text).toEqual([{ text: "Avisar a la familia" }]);
  });

  it("gives tasks their criteria and files as chips, flagging possible new scope (AC3)", () => {
    expect(entry("T3")?.chips).toEqual([
      { label: "AC2", kind: "criterion", newScope: false },
      { label: "AC3", kind: "criterion", newScope: false },
      { label: "lib/notifications/push.dart", kind: "file", newScope: true },
    ]);
    expect(entry("T3")?.newScope[0]?.es).toContain("alcance nuevo");
    expect(entry("T3")?.newScope[0]?.en).toContain("lib/notifications/push.dart");
    expect(delta.entries.filter((item) => item.newScope.length > 0)).toHaveLength(1);
    expect(entry("A2")?.chips).toBeUndefined();
  });

  it("marks chips added or removed in a modified task, and tells changes without text (AC3)", () => {
    const before = parseSpec(
      APPROVED.replace(
        "- A1: El colegio acepta justificantes digitales.\n  - impacto: alto",
        "- A1: El colegio acepta justificantes digitales.\n  - impacto: medio",
      ).replace(
        "  - files: lib/absences/list.dart\n  - ac: AC2",
        "  - files: lib/absences/list.dart, lib/absences/justify.dart\n  - ac: AC2\n  - verify: flutter test",
      ),
    ).spec;
    const after = parseSpec(
      APPROVED.replace(
        "  - files: lib/absences/list.dart\n  - ac: AC2",
        "  - files: lib/absences/list.dart\n  - ac: AC1, AC2\n  - verify: flutter test test/absences",
      ),
    ).spec;
    const changes = deriveDelta(after, before, 2).entries;
    const a1 = changes.find((item) => item.key === "A1");
    expect(a1?.change).toBe("modified");
    expect(a1?.text).toEqual([{ text: "El colegio acepta justificantes digitales." }]);
    expect(a1?.details).toEqual([
      { es: "Impacto: alto (antes: medio)", en: "Impact: high (was: medium)" },
    ]);
    const t2 = changes.find((item) => item.key === "T2");
    expect(t2?.chips).toEqual([
      { label: "AC1", kind: "criterion", change: "added", newScope: false },
      { label: "AC2", kind: "criterion", newScope: false },
      { label: "lib/absences/list.dart", kind: "file", newScope: false },
      { label: "lib/absences/justify.dart", kind: "file", change: "removed", newScope: false },
    ]);
    expect(t2?.details.map((detail) => detail.es)).toEqual([
      "Verificación: flutter test test/absences (antes: flutter test)",
    ]);
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
