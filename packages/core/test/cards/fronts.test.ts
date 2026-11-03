// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type Front,
  frontAddedCard,
  frontAssignedCard,
  frontCommitSubject,
  frontListCard,
  frontRefusalCard,
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

const refusal = (value: Parameters<typeof frontRefusalCard>[0], ctx: CardContext) =>
  renderText(frontRefusalCard(value, ctx), ctx.lang);

describe("the cards of the fronts", () => {
  it("AC1: front add says which front it added and where", () => {
    const guard = front("B", { text: "Guard e instalación.\nSin la UI." });
    const es = renderText(frontAddedCard(guard, "specty-memory", ES), "es");
    expect(es).toContain("Frente B creado en specty-memory: Guard e instalación.");
    expect(es).toContain(
      "SIGUIENTE: reparte en él las entradas con `specty front assign B <id>…`.",
    );
    expect(renderText(frontAddedCard(guard, "specty-memory", EN), "en")).toContain(
      "Front B added to specty-memory: Guard e instalación.",
    );
  });

  it("AC2: front lists each front with its text, paths and open entries in order", () => {
    const fronts = [
      front("B", {
        text: "Guard e instalación.",
        paths: ["packages/cli/src/enforce/**", "packages/cli/src/install/**"],
        items: ["P4", "P1", "P2", "P9", "P3"],
      }),
      front("ui", { items: ["P5"] }),
    ];
    const entries = [
      entry("P1", { kind: "improvement", text: "Menos llamadas a git.\nDetalle." }),
      entry("P2", { status: "done", closed: { at: "2026-11-04T10:00:00Z", by: "person" } }),
      entry("P3", { status: "taken", taken: { change: "20261104-x", at: "2026-11-04T10:00:00Z" } }),
      entry("P4"),
      entry("P5", { status: "dropped", closed: { at: "2026-11-04T10:00:00Z", by: "person" } }),
    ];
    const es = renderText(frontListCard(fronts, entries, ES), "es");
    expect(es).toContain(
      [
        "FRENTE B:",
        "  Guard e instalación. · en packages/cli/src/enforce/**, packages/cli/src/install/**",
        "  P4 · pendiente · Texto de P4",
        "  P1 · mejora · Menos llamadas a git.",
        "  P3 · pendiente · Texto de P3 · tomada por 20261104-x",
        "FRENTE UI:",
        "  Lo que abarca ui.",
        "  Sin entradas abiertas.",
      ].join("\n"),
    );
    expect(es).toContain(
      "SIGUIENTE: para repartir entradas, `specty front assign <frente> <id>…`.",
    );
    const en = renderText(frontListCard(fronts, entries, EN), "en");
    expect(en).toContain(
      [
        "FRONT B:",
        "  Guard e instalación. · in packages/cli/src/enforce/**, packages/cli/src/install/**",
        "  P4 · pending · Texto de P4",
        "  P1 · improvement · Menos llamadas a git.",
        "  P3 · pending · Texto de P3 · taken by 20261104-x",
      ].join("\n"),
    );
    expect(en).toContain("  No open entries.");
  });

  it("AC1: front without fronts says how to create one", () => {
    const es = renderText(frontListCard([], [], ES), "es");
    expect(es).toContain("No hay frentes.");
    expect(es).toContain(
      'SIGUIENTE: crea uno con `specty front add <nombre> "<texto>" --path <ruta>`.',
    );
    expect(renderText(frontListCard([], [], EN), "en")).toContain("There are no fronts.");
  });

  it("AC2: front assign says the new order and where each entry came from", () => {
    const b = front("B", { items: ["P6", "P3", "P1"] });
    const moved = [
      { front: "A", ids: ["P3", "P1"] },
      { front: "C", ids: ["P6"] },
    ];
    const es = renderText(frontAssignedCard(b, ["P3", "P1"], moved, ES), "es");
    expect(es).toContain("P3, P1 al frente B.");
    expect(es).toContain("Orden del frente B: P6, P3, P1.");
    expect(es).toContain("Ya no están en el frente A: P3, P1.");
    expect(es).toContain("Ya no están en el frente C: P6.");
    expect(es).toContain("SIGUIENTE: sigue con `specty next`.");
    const en = renderText(frontAssignedCard(b, ["P3", "P1"], moved, EN), "en");
    expect(en).toContain("P3, P1 to front B.");
    expect(en).toContain("Order of front B: P6, P3, P1.");
    expect(en).toContain("No longer in front A: P3, P1.");
  });

  it("AC1: each commit to a front has its own subject", () => {
    expect(frontCommitSubject("add", "B", [], "es")).toBe("memoria: frente B");
    expect(frontCommitSubject("add", "B", [], "en")).toBe("memory: front B");
    expect(frontCommitSubject("assign", "B", ["P3", "P1"], "es")).toBe(
      "memoria: P3, P1 al frente B",
    );
    expect(frontCommitSubject("assign", "B", ["P3", "P1"], "en")).toBe("memory: P3, P1 to front B");
  });

  it("AC3: front add and front assign explain why they write nothing", () => {
    const bad = refusal({ reason: "bad-name", name: "frente B" }, ES);
    expect(bad).toContain(
      "«frente B» no vale como nombre de un frente: usa letras sin tilde, números, `-` o `_`, hasta 40.",
    );
    expect(bad).toContain('SIGUIENTE: vuelve a ejecutar `specty front add <nombre> "<texto>"`.');
    expect(refusal({ reason: "bad-name", name: "camión" }, EN)).toContain(
      "«camión» is not a valid front name: use letters without accents, digits, `-` or `_`, up to 40.",
    );
    const exists = refusal({ reason: "exists", front: front("B", { text: "Guard." }) }, ES);
    expect(exists).toContain("Ya hay un frente «B»: Guard.");
    expect(exists).toContain(
      "SIGUIENTE: elige otro nombre, o reparte en él con `specty front assign B <id>…`.",
    );
    expect(refusal({ reason: "empty" }, ES)).toContain("El texto del frente está vacío.");
    expect(refusal({ reason: "empty" }, EN)).toContain("The front's text is empty.");
    const unknownFront = refusal({ reason: "unknown-front", name: "Z" }, ES);
    expect(unknownFront).toContain("No hay ningún frente «Z».");
    expect(unknownFront).toContain(
      "SIGUIENTE: `specty front` los lista; crea uno con `specty front add`.",
    );
    expect(refusal({ reason: "unknown", id: "P9" }, ES)).toContain("No hay ninguna entrada P9.");
    const reminder = refusal({ reason: "not-work", entry: entry("P2", { kind: "reminder" }) }, ES);
    expect(reminder).toContain(
      "Solo los pendientes y las mejoras van en un frente, y P2 es un recordatorio.",
    );
    expect(reminder).toContain(
      "SIGUIENTE: quítala de la lista y vuelve a ejecutar `specty front assign`.",
    );
    expect(
      refusal({ reason: "not-work", entry: entry("D1", { kind: "decision", quote: "sí" }) }, EN),
    ).toContain("Only pending items and improvements go in a front, and D1 is a decision.");
    const closed = { at: "2026-11-04T10:00:00Z", by: "person" };
    expect(
      refusal({ reason: "closed", entry: entry("P3", { status: "done", closed }) }, ES),
    ).toContain("P3 ya está hecha.");
    expect(
      refusal({ reason: "closed", entry: entry("P4", { status: "dropped", closed }) }, EN),
    ).toContain("P4 is already dropped.");
  });
});
