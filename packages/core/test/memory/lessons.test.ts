// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  MEMORY_KINDS,
  type MemoryEntry,
  memoryListCard,
  memoryReadme,
  memoryRefusalCard,
  parseEntry,
  renderText,
  resolvesRefusalCard,
  serializeEntry,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const lesson = (extra: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id: "P3",
  kind: "lesson",
  status: "open",
  created: "2026-11-03T10:00:00.000Z",
  origin: { by: "claude-code" },
  paths: ["packages/ui/src/**"],
  text: "El hilo principal solo importa de core/light.",
  ...extra,
});

const decision: MemoryEntry = {
  id: "D1",
  kind: "decision",
  status: "open",
  created: "2026-11-02T10:00:00.000Z",
  origin: { by: "person" },
  quote: "sí",
  paths: ["docs/**", "AGENTS.md"],
  text: "La documentación va en español.",
};

describe("lessons and paths in Specty's memory", () => {
  it("AC1: a lesson is a kind of entry, and keeps its paths through its file", () => {
    expect(MEMORY_KINDS).toContain("lesson");
    expect(parseEntry(serializeEntry(lesson()))).toEqual(lesson());
  });

  it("AC1: a lesson without paths is not a valid entry", () => {
    const { paths: _paths, ...bare } = lesson();
    expect(parseEntry(serializeEntry(bare))).toBeUndefined();
    expect(parseEntry(serializeEntry(lesson({ paths: [] })))).toBeUndefined();
  });

  it("AC2: a decision keeps its paths too", () => {
    expect(parseEntry(serializeEntry(decision))).toEqual(decision);
  });

  it("AC2: the list shows the paths of each entry that has them", () => {
    const plain: MemoryEntry = { ...lesson(), id: "P1", kind: "pending", text: "Sin rutas" };
    const { paths: _paths, ...pending } = plain;
    const memory = [lesson(), decision, pending];
    const es = renderText(memoryListCard(memory, { all: false }, ES), "es");
    expect(es).toContain(
      "P3 · lección · El hilo principal solo importa de core/light. — claude-code, 2026-11-03 · en packages/ui/src/**",
    );
    expect(es).toContain(
      "D1 · decisión · La documentación va en español. «sí» — la persona, 2026-11-02 · en docs/**, AGENTS.md",
    );
    expect(es).toContain("P1 · pendiente · Sin rutas — claude-code, 2026-11-03\n");
    expect(renderText(memoryListCard([lesson()], { all: false }, EN), "en")).toContain(
      "P3 · lesson · El hilo principal solo importa de core/light. — claude-code, 2026-11-03 · in packages/ui/src/**",
    );
  });

  it("AC2: the branch's index has a section for lessons", () => {
    expect(memoryReadme([lesson()], "es")).toContain("## Lecciones");
    expect(memoryReadme([lesson()], "en")).toContain("## Lessons");
  });

  it("AC1: says how to add a lesson without paths", () => {
    const es = renderText(memoryRefusalCard({ reason: "no-path" }, ES), "es");
    expect(es).toContain("Una lección lleva las rutas a las que se refiere, y falta `--path`.");
    expect(es).toContain(
      'SIGUIENTE: vuelve a ejecutar `specty memory add "<texto>" --kind lesson --path <ruta>`.',
    );
    expect(renderText(memoryRefusalCard({ reason: "no-path" }, EN), "en")).toContain(
      "A lesson carries the paths it is about, and `--path` is missing.",
    );
  });

  it("AC1: names a lesson as such when --resolves refuses it", () => {
    const text = renderText(resolvesRefusalCard({ reason: "not-work", entry: lesson() }, ES), "es");
    expect(text).toContain("P3 es una lección: `--resolves` solo toma pendientes y mejoras.");
  });
});
