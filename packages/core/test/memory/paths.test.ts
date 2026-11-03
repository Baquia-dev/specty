// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type ChangeView,
  entriesForPaths,
  type MemoryEntry,
  nextCard,
  renderText,
  type TaskView,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const CLOSED = { at: "2026-11-03T12:00:00.000Z", by: "person" };

const entry = (id: string, day: number, extra: Partial<MemoryEntry>): MemoryEntry => ({
  id,
  kind: "lesson",
  status: "open",
  created: `2026-11-${String(day).padStart(2, "0")}T10:00:00.000Z`,
  origin: { by: "claude-code" },
  text: `Texto de ${id}`,
  ...extra,
});

const API = entry("P1", 2, { paths: ["src/api/**"], text: "El cliente reintenta tres veces." });
const DOCS = entry("P2", 3, { paths: ["docs/**"] });
const FORMAL = entry("D1", 1, {
  kind: "decision",
  quote: "de usted",
  paths: ["src/api/client.ts"],
  text: "Los mensajes van de usted.",
});
const MEMORY: readonly MemoryEntry[] = [
  API,
  DOCS,
  FORMAL,
  entry("P3", 4, { kind: "pending", paths: ["src/api/**"] }),
  entry("P4", 5, { paths: ["src/api/**"], status: "dropped", closed: CLOSED }),
  entry("D2", 6, { kind: "decision", quote: "sí" }),
];

const task: TaskView = {
  id: "T1",
  title: "Cliente",
  status: "active",
  files: ["src/api/client.ts"],
  extras: [],
  criteria: [],
  effort: "medium",
};

/** `next`'s card of a change in `phase`, as the agent reads it. */
const card = (change: Partial<ChangeView>, ctx = ES): string =>
  renderText(
    nextCard(
      {
        change: {
          id: "20261103-x",
          kind: "standard",
          phase: "implementing",
          title: "X",
          specPath: ".specty/changes/20261103-x/spec.md",
          revision: 1,
          tasks: [task],
          conventions: [],
          pendingScope: [],
          rejected: [],
          closingSubmitted: false,
          specChanged: false,
          ...change,
        },
        dirty: [],
      },
      ctx,
    ),
    ctx.lang,
  );

const SECTION = [
  "LECCIONES Y DECISIONES DE ESTOS ARCHIVOS:",
  "  D1 · decisión · Los mensajes van de usted. «de usted» · en src/api/client.ts",
  "  P1 · lección · El cliente reintenta tres veces. · en src/api/**",
  '  Tenlas en cuenta; si alguna ya no vale, propón descartarla con `specty memory drop <id> --reason "<motivo>"`.',
].join("\n");

describe("which lessons and decisions belong to some files", () => {
  it("AC1: the open ones whose paths match a file, either way, by date", () => {
    expect(entriesForPaths(MEMORY, ["src/api/client.ts"])).toEqual([FORMAL, API]);
    expect(entriesForPaths(MEMORY, ["src/**"])).toEqual([FORMAL, API]);
    expect(entriesForPaths(MEMORY, ["docs/guia.md", "src/api/client.ts"])).toEqual([
      FORMAL,
      API,
      DOCS,
    ]);
  });

  it("AC3: none for files no path matches, or without files", () => {
    expect(entriesForPaths(MEMORY, ["lib/other.ts"])).toEqual([]);
    expect(entriesForPaths(MEMORY, [])).toEqual([]);
  });
});

describe("the lessons and decisions of the files in the cards", () => {
  it("AC1: show in the card of the active task", () => {
    expect(card({ pathEntries: [FORMAL, API] })).toContain(SECTION);
    expect(card({ pathEntries: [API] }, EN)).toContain(
      "LESSONS AND DECISIONS FOR THESE FILES:\n  P1 · lesson · El cliente reintenta tres veces. · in src/api/**\n",
    );
  });

  it("AC2: show in the draft card", () => {
    expect(card({ phase: "draft", tasks: [], pathEntries: [FORMAL, API] })).toContain(SECTION);
  });

  it("AC3: leave the cards as they were without entries", () => {
    expect(card({ pathEntries: [] })).toBe(card({}));
    expect(card({ phase: "draft", tasks: [], pathEntries: [] })).toBe(
      card({ phase: "draft", tasks: [] }),
    );
  });
});
