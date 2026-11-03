// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  droppedEntry,
  keptEntry,
  type MemoryEntry,
  memoryCommitSubject,
  memoryDropCard,
  memoryDropRefusalCard,
  memoryKeptCard,
  parseEntry,
  renderText,
  serializeEntry,
  statusCard,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const AT = "2026-11-03T12:00:00.000Z";

let day = 0;

/** An open pending item, a day after the one before. */
const entry = (id: string, extra: Partial<MemoryEntry> = {}): MemoryEntry => {
  day += 1;
  return {
    id,
    kind: "pending",
    status: "open",
    created: `2026-10-${String(day).padStart(2, "0")}T10:00:00.000Z`,
    origin: { by: "claude-code" },
    text: `Texto de ${id}`,
    ...extra,
  };
};

const proposed = (id: string, reason: string, extra: Partial<MemoryEntry> = {}) =>
  entry(id, { status: "drop-proposed", drop: { reason, by: "claude-code", at: AT }, ...extra });

const text = (card: Parameters<typeof renderText>[0], ctx: CardContext = ES) =>
  renderText(card, ctx.lang);

describe("a dropped, proposed or kept entry", () => {
  it("AC1: dropped by the person, keeps the reason, who and when", () => {
    const drop = { reason: "Ya no aplica.", by: "person", at: AT };
    const dropped = droppedEntry(entry("P1"), drop, true);
    expect(dropped).toMatchObject({ status: "dropped", drop, closed: { at: AT, by: "person" } });
    expect(parseEntry(serializeEntry(dropped))).toEqual(dropped);
  });

  it("AC2: proposed by an agent, stays open with the reason and who proposed it", () => {
    const drop = { reason: "Duplica P1.", by: "claude-code", at: AT };
    const asked = droppedEntry(entry("P2"), drop, false);
    expect(asked).toMatchObject({ status: "drop-proposed", drop });
    expect(asked).not.toHaveProperty("closed");
    expect(parseEntry(serializeEntry(asked))).toEqual(asked);
  });

  it("AC3: kept, is open again without the proposal", () => {
    const kept = keptEntry(proposed("P2", "Duplica P1."));
    expect(kept.status).toBe("open");
    expect(kept).not.toHaveProperty("drop");
    expect(parseEntry(serializeEntry(kept))).toEqual(kept);
  });

  it("AC1: commit each operation with a subject of its own", () => {
    expect(memoryCommitSubject("drop", "P3", "es")).toBe("memoria: P3 descartada");
    expect(memoryCommitSubject("drop", "P3", "en")).toBe("memory: P3 dropped");
    expect(memoryCommitSubject("propose-drop", "P3", "es")).toBe(
      "memoria: P3 propuesta para descartar",
    );
    expect(memoryCommitSubject("propose-drop", "P3", "en")).toBe("memory: P3 proposed to drop");
    expect(memoryCommitSubject("keep", "P3", "es")).toBe("memoria: P3 se mantiene");
    expect(memoryCommitSubject("keep", "P3", "en")).toBe("memory: P3 kept");
  });
});

describe("the cards of memory drop and keep", () => {
  it("AC1: say the entry is dropped, with its reason", () => {
    const dropped = droppedEntry(
      entry("P1"),
      { reason: "Ya no aplica.", by: "person", at: AT },
      true,
    );
    expect(text(memoryDropCard(dropped, ES))).toContain("P1 descartada: Ya no aplica.");
    expect(text(memoryDropCard(dropped, EN), EN)).toContain("P1 dropped: Ya no aplica.");
  });

  it("AC2: tell the agent the entry is only proposed, and to tell the user", () => {
    const card = memoryDropCard(proposed("P2", "Duplica P1."), ES);
    expect(text(card)).toContain(
      "P2 queda propuesta para descartar: Duplica P1. Solo la persona descarta: la verá en «TE TOCA» de `specty status`.",
    );
    expect(text(card)).toContain(
      "SIGUIENTE: dile al usuario que la descarte con `specty memory drop P2` desde su terminal, o que la mantenga con `specty memory keep P2`.",
    );
    const english = text(memoryDropCard(proposed("P2", "Duplica P1."), EN), EN);
    expect(english).toContain(
      "P2 is now proposed to drop: Duplica P1. Only the person drops: they will see it in «YOUR TURN» of `specty status`.",
    );
    expect(english).toContain(
      "NEXT: tell the user to drop it with `specty memory drop P2` from their terminal, or to keep it with `specty memory keep P2`.",
    );
  });

  it("AC3: show the proposals in «TE TOCA», before the reminders", () => {
    const memory = [
      entry("P1", { kind: "reminder", text: "Recompilar el dist" }),
      proposed("P2", "Duplica P1."),
      entry("P3"),
    ];
    const status = text(statusCard([], ES, memory));
    expect(status).toContain(
      [
        "TE TOCA:",
        "  P2 · propuesta para descartar por claude-code: Duplica P1.",
        "  Descártala con `specty memory drop <id>`, o mantenla con `specty memory keep <id>`.",
        "  P1 · Recompilar el dist",
        "  Cuando se cumpla uno, márcalo hecho con `specty memory done <id>`.",
      ].join("\n"),
    );
    expect(text(statusCard([], EN, memory), EN)).toContain(
      "YOUR TURN:\n  P2 · proposed to drop by claude-code: Duplica P1.\n  Drop it with `specty memory drop <id>`, or keep it with `specty memory keep <id>`.\n",
    );
  });

  it("AC3: say a kept entry stays open", () => {
    expect(text(memoryKeptCard(keptEntry(proposed("P2", "x")), ES))).toContain("P2 sigue abierta.");
    expect(text(memoryKeptCard(keptEntry(proposed("P2", "x")), EN), EN)).toContain(
      "P2 stays open.",
    );
  });

  it("AC4: say why nothing changed", () => {
    const cases = [
      [
        { reason: "unknown", id: "P9" },
        "La memoria no tiene la entrada P9.",
        "Specty's memory has no entry P9.",
      ],
      [
        {
          reason: "closed",
          entry: entry("P1", { status: "done", closed: { at: AT, by: "person" } }),
        },
        "P1 ya está hecha.",
        "P1 is already done.",
      ],
      [
        {
          reason: "closed",
          entry: entry("P2", { status: "dropped", closed: { at: AT, by: "person" } }),
        },
        "P2 ya está descartada.",
        "P2 is already dropped.",
      ],
      [
        { reason: "taken", entry: entry("P3", { status: "taken" }), change: "20261103-saludo" },
        "P3 la tomó el cambio 20261103-saludo: se libera si se cancela, y queda hecha si se cierra.",
        "P3 was taken by change 20261103-saludo: it gets free if that change is cancelled, and done if it closes.",
      ],
      [
        { reason: "no-reason", id: "P4" },
        'Falta el motivo: `--reason "<motivo>"`.',
        'The reason is missing: `--reason "<reason>"`.',
      ],
      [
        { reason: "not-proposed", entry: entry("P5") },
        "P5 no está propuesta para descartar.",
        "P5 is not proposed to drop.",
      ],
    ] as const;
    for (const [refusal, es, en] of cases) {
      const card = memoryDropRefusalCard(refusal, ES);
      expect(card.status).not.toBe("ok");
      expect(text(card)).toContain(es);
      expect(text(memoryDropRefusalCard(refusal, EN), EN)).toContain(en);
    }
  });

  it("AC4: point to the way forward", () => {
    expect(text(memoryDropRefusalCard({ reason: "no-reason", id: "P4" }, ES))).toContain(
      'SIGUIENTE: vuelve a ejecutar `specty memory drop P4 --reason "<motivo>"`.',
    );
    expect(
      text(
        memoryDropRefusalCard(
          { reason: "taken", entry: entry("P3", { status: "taken" }), change: "20261103-saludo" },
          ES,
        ),
      ),
    ).toContain("SIGUIENTE: pregúntale al usuario si cancela 20261103-saludo.");
    expect(text(memoryDropRefusalCard({ reason: "unknown", id: "P9" }, ES))).toContain(
      "SIGUIENTE: mira las entradas abiertas con `specty memory`.",
    );
  });
});
