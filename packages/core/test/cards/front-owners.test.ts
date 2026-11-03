// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type Front,
  type FrontOwner,
  frontFreedCard,
  frontHeldDenial,
  frontListCard,
  frontTakenCard,
  type MemoryEntry,
  renderText,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const front = (name: string, extra: Partial<Front> = {}): Front => ({
  name,
  created: "2026-11-04T10:00:00.000Z",
  origin: { by: "claude-code" },
  items: [],
  text: `Lo que abarca ${name}.`,
  ...extra,
});

const entry = (id: string, extra: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id,
  kind: "pending",
  status: "open",
  created: "2026-11-01T10:00:00.000Z",
  origin: { by: "claude-code" },
  text: `Texto de ${id}`,
  ...extra,
});

const GUARD = front("B", {
  text: "Guard e instalación.",
  paths: ["packages/cli/src/enforce/**"],
  items: ["P3", "P4", "P1"],
});

const ENTRIES = [
  entry("P1", { kind: "improvement" }),
  entry("P3", { status: "taken", taken: { change: "20261104-x", at: "2026-11-04T10:00:00Z" } }),
  entry("P4"),
];

const owner = (tool: string, ago: number, name = "B"): FrontOwner => ({ front: name, tool, ago });

describe("who holds each front, in the cards", () => {
  it("AC1: front take shows the front, who holds it, its open entries and the first free one to take", () => {
    const es = renderText(frontTakenCard(GUARD, ENTRIES, owner("claude-code", 0), ES), "es");
    expect(es).toContain(
      [
        "FRENTE B:",
        "  Guard e instalación. · en packages/cli/src/enforce/** · lo lleva claude-code, ahora mismo",
        "  P3 · pendiente · Texto de P3 · tomada por 20261104-x",
        "  P4 · pendiente · Texto de P4",
        "  P1 · mejora · Texto de P1",
      ].join("\n"),
    );
    expect(es).toContain(
      'SIGUIENTE: crea el cambio de P4, la primera libre del frente, con `specty new "<título>" --request "<petición literal del usuario>" --resolves P4`.',
    );
    const en = renderText(frontTakenCard(GUARD, ENTRIES, owner("claude-code", 0), EN), "en");
    expect(en).toContain(
      "  Guard e instalación. · in packages/cli/src/enforce/** · held by claude-code, just now",
    );
    expect(en).toContain(
      'NEXT: create the change of P4, the front\'s first free entry, with `specty new "<title>" --request "<the user\'s literal request>" --resolves P4`.',
    );
  });

  it("AC1: front take of a front without free entries asks the person what comes next", () => {
    const done = [entry("P1", { status: "taken", taken: { change: "y", at: "2026-11-04" } })];
    const es = renderText(frontTakenCard(front("B", { items: ["P1"] }), done, undefined, ES), "es");
    expect(es).toContain(
      "SIGUIENTE: el frente B no tiene entradas libres: pregúntale a la persona qué sigue.",
    );
    expect(renderText(frontTakenCard(front("B"), [], owner("codex", 2), EN), "en")).toContain(
      "NEXT: front B has no free entries: ask the person what comes next.",
    );
  });

  it("AC5: front take without an owner says nobody holds the front, and why", () => {
    const es = renderText(frontTakenCard(GUARD, ENTRIES, undefined, ES), "es");
    expect(es).toContain(
      "Nadie lleva el frente B: solo el guard de Specty registra la conversación de un agente que lo toma.",
    );
    expect(es).toContain("  Guard e instalación. · en packages/cli/src/enforce/**\n");
    expect(renderText(frontTakenCard(GUARD, ENTRIES, undefined, EN), "en")).toContain(
      "Nobody holds front B: only Specty's guard records the agent conversation that takes it.",
    );
  });

  it("AC3: front free says the front is free, and who held it", () => {
    const held = renderText(frontFreedCard(GUARD, owner("codex", 3), ES), "es");
    expect(held).toContain("El frente B queda libre (lo llevaba codex, hace 3 min).");
    expect(held).toContain("SIGUIENTE: sigue con `specty next`.");
    expect(renderText(frontFreedCard(GUARD, owner("codex", 3), EN), "en")).toContain(
      "Front B is free (codex held it, 3 min ago).",
    );
    expect(renderText(frontFreedCard(GUARD, undefined, ES), "es")).toContain(
      "El frente B queda libre; nadie lo llevaba.",
    );
    expect(renderText(frontFreedCard(GUARD, undefined, EN), "en")).toContain(
      "Front B is free; nobody held it.",
    );
  });

  it("AC2: the guard's denial says who holds the front, since when and how to free it", () => {
    const take = frontHeldDenial(owner("codex", 3), "take", "es", "specty");
    expect(take.reason).toBe(
      "El frente B ya tiene dueño: lo lleva codex, hace 3 min, en otra conversación.",
    );
    expect(take.next).toBe(
      "toma otro frente libre (`specty front` los lista) o pídele a la persona que lo libere en su terminal con `specty front free B`; queda libre solo si esa conversación pasa `memory.orphanAfterMin` minutos sin dar un paso.",
    );
    const free = frontHeldDenial(owner("codex", 3), "free", "es", "specty");
    expect(free.reason).toBe(take.reason);
    expect(free.next).toBe(
      "solo esa conversación o la persona lo liberan: pídele a la persona que lo libere en su terminal con `specty front free B`.",
    );
    const en = frontHeldDenial(owner("codex", 3), "take", "en", "specty");
    expect(en.reason).toBe(
      "Front B already has an owner: held by codex, 3 min ago, in another conversation.",
    );
    expect(en.next).toBe(
      "take another free front (`specty front` lists them) or ask the person to free it in their terminal with `specty front free B`; it frees itself only once that conversation goes `memory.orphanAfterMin` minutes without a step.",
    );
    expect(frontHeldDenial(owner("codex", 3), "free", "en", "specty").next).toBe(
      "only that conversation or the person frees it: ask the person to free it in their terminal with `specty front free B`.",
    );
  });

  it("AC4: front names who holds each front and since when", () => {
    const fronts = [GUARD, front("ui")];
    const es = renderText(frontListCard(fronts, ENTRIES, ES, [owner("codex", 3)]), "es");
    expect(es).toContain(
      "FRENTE B:\n  Guard e instalación. · en packages/cli/src/enforce/** · lo lleva codex, hace 3 min\n",
    );
    expect(es).toContain("FRENTE UI:\n  Lo que abarca ui.\n");
    const en = renderText(frontListCard(fronts, ENTRIES, EN, [owner("codex", 90, "ui")]), "en");
    expect(en).toContain("FRONT B:\n  Guard e instalación. · in packages/cli/src/enforce/**\n");
    expect(en).toContain("FRONT UI:\n  Lo que abarca ui. · held by codex, 1 h ago\n");
  });
});
