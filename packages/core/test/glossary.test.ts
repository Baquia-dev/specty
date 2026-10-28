// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { glossaryTemplate, parseGlossary, resolveConfig, termsIn } from "../src";

const GLOSSARY = [
  "# Dominio",
  "",
  "<!-- - **Ejemplo** (`Example`): una pista que no cuenta. -->",
  "- **Pedido** (`Order`): lo que un cliente compra en una visita.",
  "- **Línea de pedido**: un producto y su cantidad dentro de un pedido.",
  "* **Cliente** (`Customer`): quien compra.",
  "Texto suelto que no es un término.",
  "- **Sin definición**:",
].join("\n");

const entries = parseGlossary(GLOSSARY);
const found = (...texts: string[]) => termsIn(entries, texts).map((entry) => entry.term);

describe("the glossary", () => {
  it("AC3: reads one term per line, with its name in the code, and nothing else", () => {
    expect(entries).toEqual([
      {
        term: "Pedido",
        code: "Order",
        definition: "lo que un cliente compra en una visita.",
      },
      { term: "Línea de pedido", definition: "un producto y su cantidad dentro de un pedido." },
      { term: "Cliente", code: "Customer", definition: "quien compra." },
    ]);
  });

  it("AC3: finds a term in plural, in other case or by its name in the code, in the glossary's order", () => {
    expect(found("Los PEDIDOS del día")).toEqual(["Pedido"]);
    expect(found("const order = new Order();")).toEqual(["Pedido"]);
    expect(found("Customer", "una línea de pedido")).toEqual([
      "Pedido",
      "Línea de pedido",
      "Cliente",
    ]);
  });

  it("AC3: does not count a term inside another word, nor its code name in other case", () => {
    expect(found("despedido", "Ordering", "clientela", "order")).toEqual([]);
  });

  it("AC5: defines nothing with only hints, or without a file", () => {
    expect(
      parseGlossary("# Dominio\n\n<!--\n- **Pedido** (`Order`): lo que se compra.\n-->\n"),
    ).toEqual([]);
    expect(parseGlossary("")).toEqual([]);
    expect(termsIn([], ["Pedido"])).toEqual([]);
  });

  it("AC1: starts with a title and the hints of its format, which define no term", () => {
    const es = glossaryTemplate("es");
    expect(es).toMatch(/^# Glosario del dominio\n\n<!--\n/);
    expect(es).toContain("- **Pedido** (`Order`): lo que un cliente compra en una visita.");
    expect(glossaryTemplate("en")).toMatch(/^# Domain glossary\n\n<!--\n/);
    expect(parseGlossary(es)).toEqual([]);
    expect(parseGlossary(glossaryTemplate("en"))).toEqual([]);
  });

  it("lives where `glossary` says or, without it, by the project's language", () => {
    const at = (input: Record<string, unknown>) => {
      const result = resolveConfig({ version: 1, ...input });
      return result.ok ? result.config.glossary : undefined;
    };
    expect(at({ language: "es" })).toBe("docs/dominio.md");
    expect(at({ language: "en" })).toBe("docs/domain.md");
    expect(at({ language: "es", glossary: "GLOSARIO.md" })).toBe("GLOSARIO.md");
  });
});
