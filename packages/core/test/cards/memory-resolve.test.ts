// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type MemoryEntry,
  type MemoryResolveRefusal,
  memoryResolvedCard,
  memoryResolveRefusalCard,
  renderText,
  type StatusEntry,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const CHANGE = "20261106-saludo";
const AT = "2026-11-06T12:00:00.000Z";
const CLOSED = { at: AT, by: "person" };

/** An open pending item of Specty's memory. */
const entry = (id: string, extra: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id,
  kind: "pending",
  status: "open",
  created: "2026-11-01T10:00:00.000Z",
  origin: { by: "claude-code" },
  text: `Texto de ${id}`,
  ...extra,
});

/** Another open change, as `status` sees it. */
const OTHER: StatusEntry = {
  id: CHANGE,
  kind: "standard",
  phase: "implementing",
  title: "Saludo",
  waitingFor: "agent",
  current: false,
  pendingScope: [],
  folder: ".worktrees/20261106-saludo",
  holder: { tool: "claude-code", ago: 3 },
};

const text = (refusal: MemoryResolveRefusal, ctx: CardContext) =>
  renderText(memoryResolveRefusalCard(refusal, ctx), ctx.lang);

describe("the card of `memory resolve` that takes entries", () => {
  const taken = [
    entry("P1", { text: "Uno\ncon más texto", status: "taken", taken: { change: CHANGE, at: AT } }),
    entry("P2", { kind: "improvement", text: "Dos", status: "taken" }),
  ];

  it("AC1: names each entry with its kind and first line, and what happens when the change ends", () => {
    const card = memoryResolvedCard(taken, ES);
    expect(card.status).toBe("ok");
    expect(renderText(card, "es")).toContain(
      "RESUELVE:\n  P1 · pendiente · Uno\n  P2 · mejora · Dos\n  Quedan hechas al cerrarse este cambio, y libres si se cancela.\n",
    );
    expect(renderText(card, "es")).toContain("SIGUIENTE: sigue con `specty next`.");
  });

  it("AC7: says the same in English", () => {
    const out = renderText(memoryResolvedCard(taken, EN), "en");
    expect(out).toContain(
      "RESOLVES:\n  P1 · pending · Uno\n  P2 · improvement · Dos\n  They get done when this change closes, and free again if it is cancelled.\n",
    );
    expect(out).toContain("NEXT: go on with `specty next`.");
  });
});

describe("the card of `memory resolve` that takes nothing", () => {
  it("AC4: without an open change in the folder, says it takes the entries for that change", () => {
    const refusal = { reason: "no-change" } as const;
    expect(memoryResolveRefusalCard(refusal, ES).status).toBe("blocked");
    const es = text(refusal, ES);
    expect(es).toContain(
      "No hay un cambio abierto en esta carpeta: `specty memory resolve` toma las entradas para ese cambio.",
    );
    expect(es).toContain(
      "SIGUIENTE: entra en la carpeta del cambio cuyo trabajo las resolvió y vuelve a ejecutarlo; si ninguno lo hizo, déjalas abiertas.",
    );
    const en = text(refusal, EN);
    expect(en).toContain(
      "There is no open change in this folder: `specty memory resolve` takes the entries for that change.",
    );
    expect(en).toContain(
      "NEXT: go into the folder of the change whose work resolved them and run it again; if none did, leave them open.",
    );
  });

  it("AC3: says why it cannot take an unknown id, a closed entry, a decision or a lesson", () => {
    const cases = [
      [
        { reason: "unknown", id: "P9" },
        "La memoria no tiene la entrada P9.",
        "Specty's memory has no entry P9.",
      ],
      [
        { reason: "unavailable", entry: entry("P2", { status: "done", closed: CLOSED }) },
        "P2 ya está hecha: no se puede tomar.",
        "P2 is already done: it cannot be taken.",
      ],
      [
        { reason: "unavailable", entry: entry("P3", { status: "dropped", closed: CLOSED }) },
        "P3 ya está descartada: no se puede tomar.",
        "P3 is already dropped: it cannot be taken.",
      ],
      [
        { reason: "unavailable", entry: entry("P4", { status: "drop-proposed" }) },
        "P4 ya está propuesta para descartar: no se puede tomar.",
        "P4 is already proposed to drop: it cannot be taken.",
      ],
      [
        { reason: "not-work", entry: entry("D1", { kind: "decision", quote: "sí" }) },
        "D1 es una decisión: `specty memory resolve` solo toma pendientes y mejoras.",
        "D1 is a decision: `specty memory resolve` only takes pending items and improvements.",
      ],
      [
        { reason: "not-work", entry: entry("P5", { kind: "lesson", paths: ["src/**"] }) },
        "P5 es una lección: `specty memory resolve` solo toma pendientes y mejoras.",
        "P5 is a lesson: `specty memory resolve` only takes pending items and improvements.",
      ],
    ] as const;
    for (const [refusal, es, en] of cases) {
      expect(memoryResolveRefusalCard(refusal, ES).status).not.toBe("ok");
      expect(text(refusal, ES)).toContain(es);
      expect(text(refusal, EN)).toContain(en);
    }
  });

  it("AC3: points to the memory for an unknown id, and to running it again without the entry otherwise", () => {
    expect(text({ reason: "unknown", id: "P9" }, ES)).toContain(
      "SIGUIENTE: comprueba el id con `specty memory` y vuelve a ejecutar `specty memory resolve`.",
    );
    expect(text({ reason: "unknown", id: "P9" }, EN)).toContain(
      "NEXT: check the id with `specty memory` and run `specty memory resolve` again.",
    );
    const done = { reason: "unavailable", entry: entry("P2", { status: "done" }) } as const;
    expect(text(done, ES)).toContain(
      "SIGUIENTE: vuelve a ejecutarlo sin P2, o sigue con `specty next`.",
    );
    expect(text(done, EN)).toContain("NEXT: run it again without P2, or go on with `specty next`.");
  });

  it("AC3: offers to mark a reminder done instead", () => {
    const reminder = { reason: "not-work", entry: entry("P1", { kind: "reminder" }) } as const;
    expect(memoryResolveRefusalCard(reminder, ES).status).toBe("invalid");
    expect(text(reminder, ES)).toContain(
      "P1 es un recordatorio: `specty memory resolve` solo toma pendientes y mejoras.",
    );
    expect(text(reminder, ES)).toContain(
      "SIGUIENTE: si tu trabajo lo cumplió, márcalo hecho con `specty memory done P1`; vuelve a ejecutarlo sin él.",
    );
    expect(text(reminder, EN)).toContain(
      "NEXT: if your work fulfilled it, mark it done with `specty memory done P1`; run it again without it.",
    );
  });

  it("AC3: names the open change that took it, and that this change resolves it when it closes", () => {
    const refusal = {
      reason: "taken",
      entry: entry("P1", { status: "taken", taken: { change: CHANGE, at: AT } }),
      by: OTHER,
    } as const;
    expect(memoryResolveRefusalCard(refusal, ES).status).toBe("blocked");
    const es = text(refusal, ES);
    expect(es).toContain(
      `P1 ya la tomó el cambio ${CHANGE} (implementing, en .worktrees/20261106-saludo, lo lleva claude-code, hace 3 min).`,
    );
    expect(es).toContain(
      "SIGUIENTE: la resolverá ese cambio al cerrarse: vuelve a ejecutarlo sin P1, o sigue con `specty next`.",
    );
    const en = text(refusal, EN);
    expect(en).toContain(
      `P1 was already taken by change ${CHANGE} (implementing, in .worktrees/20261106-saludo, held by claude-code, 3 min ago).`,
    );
    expect(en).toContain(
      "NEXT: that change will resolve it when it closes: run it again without P1, or go on with `specty next`.",
    );
  });
});
