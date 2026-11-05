// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CardContext, initCard, renderText } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const VIEW = { done: [], detected: [], warnings: [], unfilled: [] };
const UNITS = ["  units:", '    - name: "core"', '      command: "pnpm --filter @demo/core test"'];

describe("the units init proposes, in its card", () => {
  it("AC4: go in their own block with the line that says who adds them, in Spanish", () => {
    const text = renderText(initCard({ ...VIEW, units: UNITS }, ES), "es");
    expect(text).toContain("UNIDADES DE VERIFICACIÓN PROPUESTAS:");
    for (const line of UNITS) expect(text).toContain(line);
    expect(text).toContain(
      "Añádelas tú a `verify:` en .specty/config.yaml tras comprobar que entre todas ejecutan lo mismo que `verify.full`, al que reemplazan; Specty no las escribe.",
    );
  });

  it("AC4: and in English", () => {
    const text = renderText(initCard({ ...VIEW, units: UNITS }, EN), "en");
    expect(text).toContain("PROPOSED VERIFICATION UNITS:");
    expect(text).toContain(
      "Add them yourself under `verify:` in .specty/config.yaml after checking that together they run what `verify.full` runs, which they replace; Specty does not write them.",
    );
  });

  it("AC4: without units, there is no such block", () => {
    expect(renderText(initCard(VIEW, ES), "es")).not.toContain("UNIDADES DE VERIFICACIÓN");
  });
});
