// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type ChangeView,
  type MemoryEntry,
  memoryListCard,
  memoryRefusalCard,
  nextCard,
  renderText,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const entry = (id: string, extra: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id,
  kind: "reminder",
  status: "open",
  created: "2026-11-01T10:00:00.000Z",
  origin: { by: "claude-code" },
  text: `Texto de ${id}`,
  ...extra,
});

const lesson = entry("P1", {
  kind: "lesson",
  text: "La caché se invalida a mano.",
  paths: ["src/api/**"],
});
const reminder = entry("P7", {
  text: "Avisar a soporte del cambio de la API.",
  paths: ["src/api/**"],
});

/** The card of the active task T1, with `pathEntries`. */
const taskCard = (pathEntries: readonly MemoryEntry[], ctx: CardContext): string => {
  const change: ChangeView = {
    id: "20261103-x",
    kind: "standard",
    phase: "implementing",
    title: "X",
    specPath: ".specty/changes/20261103-x/spec.md",
    revision: 1,
    tasks: [
      {
        id: "T1",
        title: "Tarea T1",
        status: "active",
        files: ["src/api/client.ts"],
        extras: [],
        criteria: [],
        effort: "medium",
      },
    ],
    conventions: [],
    pendingScope: [],
    rejected: [],
    closingSubmitted: false,
    specChanged: false,
    pathEntries,
  };
  return renderText(nextCard({ change, dirty: [] }, ctx), ctx.lang);
};

const refusal = (value: Parameters<typeof memoryRefusalCard>[0], ctx: CardContext) =>
  renderText(memoryRefusalCard(value, ctx), ctx.lang);

describe("reminders with a trigger in the cards", () => {
  it("AC1: the list shows the day a reminder waits for", () => {
    const due = entry("P2", { due: "2026-11-10" });
    expect(renderText(memoryListCard([due], { all: false }, ES), "es")).toContain(
      "P2 · recordatorio · desde 2026-11-10 · Texto de P2 — claude-code, 2026-11-01",
    );
    expect(renderText(memoryListCard([due], { all: false }, EN), "en")).toContain(
      "P2 · reminder · from 2026-11-10 · Texto de P2 — claude-code, 2026-11-01",
    );
    expect(renderText(memoryListCard([entry("P3")], { all: false }, ES), "es")).toContain(
      "P3 · recordatorio · Texto de P3 — claude-code, 2026-11-01",
    );
  });

  it("AC2: the task card shows the reminders of its files in their own section", () => {
    const es = taskCard([lesson, reminder], ES);
    expect(es).toContain(
      "LECCIONES Y DECISIONES DE ESTOS ARCHIVOS:\n  P1 · lección · La caché se invalida a mano. · en src/api/**\n",
    );
    expect(es).toContain(
      [
        "RECORDATORIOS DE ESTOS ARCHIVOS:",
        "  P7 · Avisar a soporte del cambio de la API. · en src/api/**",
        "  Cuando se cumpla uno, márcalo hecho con `specty memory done <id>`.",
      ].join("\n"),
    );
    expect(es.indexOf("LECCIONES Y DECISIONES")).toBeLessThan(es.indexOf("RECORDATORIOS DE"));
    expect(taskCard([lesson, reminder], EN)).toContain(
      [
        "REMINDERS FOR THESE FILES:",
        "  P7 · Avisar a soporte del cambio de la API. · in src/api/**",
        "  When one is fulfilled, mark it done with `specty memory done <id>`.",
      ].join("\n"),
    );
    const only = taskCard([reminder], ES);
    expect(only).toContain("RECORDATORIOS DE ESTOS ARCHIVOS:");
    expect(only).not.toContain("LECCIONES Y DECISIONES DE ESTOS ARCHIVOS");
    expect(taskCard([lesson], ES)).not.toContain("RECORDATORIOS DE ESTOS ARCHIVOS");
  });

  it("AC3: memory add explains a wrong day, a day on another kind and two triggers", () => {
    const bad = refusal({ reason: "bad-date", value: "10/11/2026" }, ES);
    expect(bad).toContain("`--due` espera un día como AAAA-MM-DD, y «10/11/2026» no lo es.");
    expect(bad).toContain(
      'SIGUIENTE: vuelve a ejecutar `specty memory add "<texto>" --kind reminder --due AAAA-MM-DD`.',
    );
    expect(refusal({ reason: "bad-date", value: "mañana" }, EN)).toContain(
      "`--due` expects a day as YYYY-MM-DD, and «mañana» is not one.",
    );
    const kind = refusal({ reason: "due-not-reminder", kind: "pending" }, ES);
    expect(kind).toContain(
      "Solo un recordatorio espera a un día, y esta entrada sería un pendiente.",
    );
    expect(kind).toContain("SIGUIENTE: añade `--kind reminder` o quita `--due`.");
    expect(refusal({ reason: "due-not-reminder", kind: "lesson" }, EN)).toContain(
      "Only a reminder waits for a day, and this entry would be a lesson.",
    );
    const both = refusal({ reason: "two-triggers" }, ES);
    expect(both).toContain(
      "Un recordatorio lleva un solo disparador: `--due` o `--path`, no los dos.",
    );
    expect(both).toContain("SIGUIENTE: quédate con uno y vuelve a ejecutar `specty memory add`.");
    expect(refusal({ reason: "two-triggers" }, EN)).toContain(
      "A reminder carries a single trigger: `--due` or `--path`, not both.",
    );
  });
});
