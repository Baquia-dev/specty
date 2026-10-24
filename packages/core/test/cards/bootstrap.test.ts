// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CardContext, nextCard, parseSpec, renderText, specTemplate } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

describe("a new project's first change", () => {
  it("is the skeleton, from PRODUCT.md, when next finds no change and no code (AC1)", () => {
    const fresh = renderText(nextCard({ dirty: [], fresh: true }, ES), "es");
    expect(fresh).toContain("es un proyecto nuevo: aún no hay código.");
    expect(fresh).toContain(
      "El primer cambio es el esqueleto del proyecto, a partir de PRODUCT.md",
    );
    expect(fresh).toContain(
      'SIGUIENTE: ejecuta `specty new "Esqueleto del proyecto" --request "<petición literal del usuario>"`.',
    );
    expect(fresh).not.toContain("--kind quick");
    expect(renderText(nextCard({ dirty: [], fresh: true }, EN), "en")).toContain(
      'run `specty new "Project skeleton"',
    );
  });

  it("keeps the usual card when the project has code (AC4)", () => {
    const usual = renderText(nextCard({ dirty: [] }, ES), "es");
    expect(usual).toContain("No hay un cambio activo.");
    expect(usual).toContain("--kind quick");
    expect(usual).not.toContain("proyecto nuevo");
  });

  it("gets a template with the skeleton's hints, which propose still removes (AC3, AC4)", () => {
    const bootstrap = specTemplate({
      kind: "standard",
      lang: "es",
      title: "Esqueleto",
      bootstrap: true,
    });
    expect(bootstrap).toContain("<!-- El esqueleto del proyecto, a partir de PRODUCT.md");
    expect(bootstrap).toContain("porque aún no hay verify.default. -->");
    expect(bootstrap).toContain("<!-- Lo que este cambio NO hará");
    const usual = specTemplate({ kind: "standard", lang: "es", title: "Esqueleto" });
    expect(usual).not.toContain("PRODUCT.md");
    // Only comments: the parsed sections are as empty as the usual template's.
    expect(parseSpec(bootstrap).spec.sections).toEqual(parseSpec(usual).spec.sections);
  });
});
