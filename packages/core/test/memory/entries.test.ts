// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  isOpenEntry,
  type MemoryEntry,
  memoryAddedCard,
  memoryCommitSubject,
  memoryDoneCard,
  memoryListCard,
  memoryReadme,
  memoryRefusalCard,
  nextEntryId,
  parseEntry,
  parseEntryId,
  renderText,
  serializeEntry,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const CREATED = "2026-11-03T10:00:00.000Z";

const entry = (extra: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id: "P1",
  kind: "pending",
  status: "open",
  created: CREATED,
  origin: { change: "20261103-saludo", by: "claude-code" },
  text: "Probar el saludo en Windows",
  ...extra,
});

const DECISION = entry({
  id: "D1",
  kind: "decision",
  origin: { by: "person" },
  quote: "la que tú recomiendas",
  text: "La memoria vive en una rama propia",
});

describe("an entry's markdown", () => {
  it("AC1: keeps the id, kind, status, origin and date in its frontmatter, and the text below", () => {
    const text = serializeEntry(entry());
    expect(text.startsWith("---\n")).toBe(true);
    expect(text).toContain("id: P1\n");
    expect(text).toContain("kind: pending\n");
    expect(text).toContain("status: open\n");
    expect(text).toContain(CREATED);
    expect(text).toContain("change: 20261103-saludo");
    expect(text).toContain("by: claude-code");
    expect(text.trimEnd().endsWith("---\n\nProbar el saludo en Windows")).toBe(true);
    expect(parseEntry(text)).toEqual(entry());
  });

  it("AC1: comes back as it was, with a text of several lines and without a change", () => {
    const written = entry({
      kind: "improvement",
      origin: { by: "person" },
      text: "Primera línea\n\nY un párrafo: con dos puntos y «comillas».",
    });
    expect(parseEntry(serializeEntry(written))).toEqual(written);
  });

  it("AC1: is not an entry without frontmatter, or with a kind or status Specty does not know", () => {
    expect(parseEntry("Solo texto")).toBeUndefined();
    expect(
      parseEntry(serializeEntry(entry()).replace("kind: pending", "kind: idea")),
    ).toBeUndefined();
    expect(
      parseEntry(serializeEntry(entry()).replace("status: open", "status: maybe")),
    ).toBeUndefined();
  });

  it("AC3: a decision keeps the person's quote, and is not one without it", () => {
    const text = serializeEntry(DECISION);
    expect(text).toContain("quote: la que tú recomiendas");
    expect(parseEntry(text)).toEqual(DECISION);
    expect(parseEntry(text.replace("quote: la que tú recomiendas\n", ""))).toBeUndefined();
  });
});

describe("an entry's id", () => {
  it("AC1: the next one is the highest of its prefix plus one, P for what is not a decision", () => {
    expect(nextEntryId("pending", [])).toBe("P1");
    expect(nextEntryId("pending", ["P1", "P3", "D1"])).toBe("P4");
    expect(nextEntryId("improvement", ["P1", "P3", "D7"])).toBe("P4");
    expect(nextEntryId("reminder", ["D1"])).toBe("P1");
  });

  it("AC3: a decision's starts with D and counts only decisions", () => {
    expect(nextEntryId("decision", [])).toBe("D1");
    expect(nextEntryId("decision", ["P1", "P9", "D1"])).toBe("D2");
  });

  it("AC1: reads p3 or P03 as P3, and nothing else", () => {
    expect(parseEntryId("p3")).toBe("P3");
    expect(parseEntryId(" P03 ")).toBe("P3");
    expect(parseEntryId("d2")).toBe("D2");
    expect(parseEntryId("P0")).toBeUndefined();
    expect(parseEntryId("AC1")).toBeUndefined();
    expect(parseEntryId("X1")).toBeUndefined();
  });

  it("AC2: an entry stays open until it is done or dropped", () => {
    expect(isOpenEntry(entry())).toBe(true);
    expect(isOpenEntry(entry({ status: "taken" }))).toBe(true);
    expect(isOpenEntry(entry({ status: "drop-proposed" }))).toBe(true);
    expect(isOpenEntry(entry({ status: "done" }))).toBe(false);
    expect(isOpenEntry(entry({ status: "dropped" }))).toBe(false);
  });
});

describe("the list of entries", () => {
  const OLDER = entry({ id: "P2", created: "2026-11-01T09:00:00.000Z", text: "Antes" });

  it("AC2: shows each entry by date with its id, kind, text and origin", () => {
    const output = memoryListCard([entry(), OLDER, DECISION], { all: false }, ES);
    const text = renderText(output, "es");
    expect(text).toContain("P2 · pendiente · Antes — 20261103-saludo, claude-code, 2026-11-01");
    expect(text).toContain(
      "P1 · pendiente · Probar el saludo en Windows — 20261103-saludo, claude-code, 2026-11-03",
    );
    expect(text).toContain(
      "D1 · decisión · La memoria vive en una rama propia «la que tú recomiendas» — la persona, 2026-11-03",
    );
    expect(text.indexOf("P2 ·")).toBeLessThan(text.indexOf("P1 ·"));
    expect(output.entries.map((listed) => listed.id)).toEqual(["P2", "P1", "D1"]);
  });

  it("AC2: shows only the first line of a text, in English too", () => {
    const text = renderText(
      memoryListCard([entry({ text: "Primera\nSegunda" })], { all: false }, EN),
      "en",
    );
    expect(text).toContain("P1 · pending · Primera — 20261103-saludo, claude-code, 2026-11-03");
    expect(text).not.toContain("Segunda");
  });

  it("AC2: says there is none, and how to add one", () => {
    const output = memoryListCard([], { all: false }, ES);
    expect(renderText(output, "es")).toContain("No hay entradas abiertas.");
    expect(output.next).toContain('specty memory add "<texto>"');
  });

  it("AC4: with all, names the status of an entry that is not open", () => {
    const done = entry({ kind: "reminder", status: "done", text: "Subir la rama" });
    expect(renderText(memoryListCard([done], { all: true }, ES), "es")).toContain(
      "P1 · recordatorio · hecha · Subir la rama",
    );
    expect(renderText(memoryListCard([done], { all: true }, EN), "en")).toContain(
      "P1 · reminder · done · Subir la rama",
    );
  });
});

describe("what memory add and memory done say", () => {
  it("AC1: names the new entry and the branch it went to", () => {
    const text = renderText(memoryAddedCard(entry(), "specty-memory", ES), "es");
    expect(text).toContain("P1 anotada en specty-memory: Probar el saludo en Windows");
    expect(renderText(memoryAddedCard(entry(), "specty-memory", EN), "en")).toContain(
      "P1 added to specty-memory: Probar el saludo en Windows",
    );
  });

  it("AC3: refuses a decision without the person's quote, and says how to give it", () => {
    const output = memoryRefusalCard({ reason: "no-quote" }, ES);
    expect(output.status).toBe("invalid");
    expect(renderText(output, "es")).toContain("cita literal");
    expect(output.next).toContain('--kind decision --quote "<cita>"');
    expect(memoryRefusalCard({ reason: "empty" }, EN).status).toBe("invalid");
  });

  it("AC4: marks a reminder done, and says why only a reminder is marked done", () => {
    const reminder = entry({ kind: "reminder", status: "done" });
    expect(renderText(memoryDoneCard(reminder, ES), "es")).toContain("P1");
    const pending = memoryRefusalCard({ reason: "not-reminder", entry: entry({ id: "P2" }) }, ES);
    expect(pending.status).toBe("invalid");
    expect(renderText(pending, "es")).toContain("Solo un recordatorio se marca hecho");
    expect(renderText(pending, "es")).toContain("P2 es un pendiente");
    const decision = memoryRefusalCard({ reason: "not-reminder", entry: DECISION }, EN);
    expect(renderText(decision, "en")).toContain("D1 is a decision");
    const unknown = memoryRefusalCard({ reason: "unknown", id: "P9" }, ES);
    expect(renderText(unknown, "es")).toContain("No hay ninguna entrada P9");
    expect(unknown.next).toContain("specty memory --all");
    const again = memoryRefusalCard({ reason: "already-done", id: "P1" }, ES);
    expect(renderText(again, "es")).toContain("P1 ya está hecha");
  });
});

describe("the branch's index and commits", () => {
  it("AC6: the README lists the open entries by kind, in the project's language", () => {
    const entries = [
      entry(),
      entry({ id: "P2", kind: "reminder", text: "Subir la rama" }),
      entry({ id: "P3", kind: "improvement", text: "Ver la memoria en la UI" }),
      entry({ id: "P4", kind: "reminder", status: "done", text: "Ya hecho" }),
      DECISION,
    ];
    const readme = memoryReadme(entries, "es");
    expect(readme.startsWith("# Memoria de Specty\n")).toBe(true);
    const order = ["## Pendientes", "## Mejoras", "## Recordatorios", "## Decisiones"].map(
      (heading) => readme.indexOf(heading),
    );
    expect(order.every((at) => at > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(readme).toContain("- [P1](entries/P1.md) — Probar el saludo en Windows");
    expect(readme).toContain(
      "- [D1](entries/D1.md) — La memoria vive en una rama propia «la que tú recomiendas»",
    );
    expect(readme).not.toContain("Ya hecho");
    const english = memoryReadme(entries, "en");
    expect(english.startsWith("# Specty's memory\n")).toBe(true);
    expect(english).toContain("## Reminders");
  });

  it("AC6: the README of a memory with nothing open says so, and leaves out empty kinds", () => {
    expect(memoryReadme([], "es")).toContain("No hay entradas abiertas.");
    expect(memoryReadme([entry()], "es")).not.toContain("## Decisiones");
  });

  it("AC6: each commit says what it did to which entry", () => {
    expect(memoryCommitSubject("add", "P3", "es")).toBe("memoria: anota P3");
    expect(memoryCommitSubject("add", "P3", "en")).toBe("memory: add P3");
    expect(memoryCommitSubject("done", "P2", "es")).toBe("memoria: P2 hecha");
    expect(memoryCommitSubject("done", "P2", "en")).toBe("memory: P2 done");
  });
});
