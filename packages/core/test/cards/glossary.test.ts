// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type ChangeView,
  nextCard,
  parseGlossary,
  renderText,
  type TaskView,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const glossary = {
  path: "docs/dominio.md",
  entries: parseGlossary(
    [
      "- **Pedido** (`Order`): lo que un cliente compra en una visita.",
      "- **Línea de pedido**: un producto y su cantidad dentro de un pedido.",
      "- **Cliente** (`Customer`): quien compra.",
      "- **Tienda**: el local donde se compra.",
    ].join("\n"),
  ),
};

const task: TaskView = {
  id: "T1",
  title: "Guardar el pedido",
  status: "active",
  files: ["src/order.ts"],
  extras: [],
  criteria: [{ id: "AC1", text: "CUANDO un cliente paga ENTONCES se guarda." }],
  effort: "medium",
  testRules: "first",
};

const change = (phase: ChangeView["phase"], extra: Partial<ChangeView> = {}): ChangeView => ({
  id: "20261028-pedidos",
  kind: "standard",
  phase,
  title: "Pedidos",
  specPath: ".specty/changes/20261028-pedidos/spec.md",
  revision: 1,
  tasks: [task],
  conventions: [],
  pendingScope: [],
  rejected: [],
  closingSubmitted: false,
  specChanged: false,
  glossary,
  ...extra,
});

const card = (view: ChangeView, ctx = ES) =>
  renderText(nextCard({ change: view, dirty: [] }, ctx), ctx.lang);

/** `view` in a project without a glossary. */
function bare(view: ChangeView): ChangeView {
  const { glossary: _glossary, ...rest } = view;
  return rest;
}

describe("the domain terms in the cards", () => {
  it("AC1: the task card brings the terms its title and criteria use, and no others", () => {
    const text = card(change("implementing"));
    expect(text).toContain(
      [
        "TÉRMINOS DEL DOMINIO:",
        "  Pedido (Order): lo que un cliente compra en una visita.",
        "  Cliente (Customer): quien compra.",
      ].join("\n"),
    );
    expect(text).not.toContain("Línea de pedido:");
    expect(text).not.toContain("Tienda:");
    expect(card(bare(change("implementing")))).not.toContain("TÉRMINOS");
  });

  it("AC2: the draft card brings the terms of its title and request, the testing card those of its criteria", () => {
    const draft = card(
      change("draft", { title: "Tiendas", request: "que se vean los pedidos" }),
      EN,
    );
    expect(draft).toContain(
      [
        "DOMAIN TERMS:",
        "  Pedido (Order): lo que un cliente compra en una visita.",
        "  Tienda: el local donde se compra.",
      ].join("\n"),
    );
    expect(card(change("testing"))).toContain(
      "TÉRMINOS DEL DOMINIO:\n  Cliente (Customer): quien compra.\n",
    );
  });

  it("AC4: brings the first 3 terms of the glossary, each in a line of 100 characters at most", () => {
    const long = "una definición que sigue y sigue ".repeat(5);
    const many = {
      path: "docs/dominio.md",
      entries: ["Uno", "Dos", "Tres", "Cuatro"].map((term) => ({ term, definition: long })),
    };
    const titled = { ...task, title: "Uno, dos, tres y cuatro" };
    const lines = card(change("implementing", { glossary: many, tasks: [titled] }))
      .split("\n")
      .filter((line) => /^ {2}(Uno|Dos|Tres|Cuatro):/.test(line));
    expect(lines.map((line) => line.trim().split(":")[0])).toEqual(["Uno", "Dos", "Tres"]);
    for (const line of lines) {
      expect(line.trim().length).toBeLessThanOrEqual(100);
      expect(line.endsWith("…")).toBe(true);
    }
  });

  it("AC6: the closing asks to add to the glossary the terms the change introduced or renamed", () => {
    expect(card(change("closing"))).toContain(
      "Si el cambio introdujo o renombró términos del dominio, añádelos o corrígelos en docs/dominio.md, una línea por término como las que ya tiene.",
    );
    expect(card(change("closing"), EN)).toContain(
      "If the change introduced or renamed domain terms, add or fix them in docs/dominio.md, one line per term like the ones it has.",
    );
    expect(card(bare(change("closing")))).not.toContain("términos del dominio");
  });
});
