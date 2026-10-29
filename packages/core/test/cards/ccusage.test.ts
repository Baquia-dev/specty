// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { ccusageAddedLine, ccusageFailedWarning, ccusageHint, ccusageQuestion } from "../../src";

const ADD = "pnpm add -D ccusage@20.0.45";

describe("init's offer of ccusage", () => {
  it("AC1: asks with the command it runs, and says what it did, in each language", () => {
    expect(ccusageQuestion(ADD, "es")).toBe(
      "¿Medir lo que consume cada cambio? Añade ccusage como dependencia de desarrollo con `pnpm add -D ccusage@20.0.45`.",
    );
    expect(ccusageQuestion(ADD, "en")).toBe(
      "Measure what each change consumes? It adds ccusage as a development dependency with `pnpm add -D ccusage@20.0.45`.",
    );
    expect(ccusageAddedLine("es")).toBe(
      "ccusage añadido como dependencia de desarrollo: al cerrar cada cambio, Specty dice lo que consumió.",
    );
    expect(ccusageAddedLine("en")).toBe(
      "ccusage added as a development dependency: when each change closes, Specty tells what it consumed.",
    );
  });

  it("AC3: says how to install it, and what to run when adding it failed", () => {
    expect(ccusageHint("npm i -g ccusage@20.0.45", "es")).toBe(
      "Para que Specty mida el consumo de cada cambio, instala ccusage: `npm i -g ccusage@20.0.45`.",
    );
    expect(ccusageHint(ADD, "en")).toBe(
      "For Specty to measure what each change consumes, install ccusage: `pnpm add -D ccusage@20.0.45`.",
    );
    expect(ccusageFailedWarning(ADD, "es")).toBe(
      "No se pudo añadir ccusage: ejecuta `pnpm add -D ccusage@20.0.45` para que Specty mida el consumo de cada cambio.",
    );
    expect(ccusageFailedWarning(ADD, "en")).toBe(
      "ccusage could not be added: run `pnpm add -D ccusage@20.0.45` for Specty to measure what each change consumes.",
    );
  });
});
