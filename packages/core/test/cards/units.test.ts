// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { timedOutLine, type UnitsOutcome, unitsLines, unitsReusedNote } from "../../src";

/** Two units reused, two that ran and passed, one that failed and one left after it. */
const FAILED: UnitsOutcome = {
  reused: ["core", "exporters"],
  passed: [
    { name: "cli", ms: 125_000 },
    { name: "static", ms: 41_200 },
  ],
  failed: { name: "ui", ms: 3_400 },
  skipped: ["vscode"],
};

describe("the lines of what the units of a full verification did", () => {
  it("AC5: say which were reused, which ran with their time, which failed and which did not run, in Spanish", () => {
    expect(unitsLines(FAILED, "es")).toEqual([
      "Reutilizadas (ya pasaron con este mismo código): core, exporters.",
      "Ejecutadas y correctas: cli (2 min 5 s), static (41 s).",
      "Falló: ui (3 s).",
      "Sin ejecutar tras el fallo: vscode.",
    ]);
  });

  it("AC5: say the same in English", () => {
    expect(unitsLines(FAILED, "en")).toEqual([
      "Reused (they already passed on this same code): core, exporters.",
      "Run and passed: cli (2 min 5 s), static (41 s).",
      "Failed: ui (3 s).",
      "Not run after the failure: vscode.",
    ]);
  });

  it("AC5: leave out what did not happen", () => {
    const ran: UnitsOutcome = { reused: [], passed: [{ name: "cli", ms: 900 }], skipped: [] };
    expect(unitsLines(ran, "es")).toEqual(["Ejecutadas y correctas: cli (1 s)."]);
    expect(unitsLines(ran, "en")).toEqual(["Run and passed: cli (1 s)."]);
    const reused: UnitsOutcome = { reused: ["core"], passed: [], skipped: [] };
    expect(unitsLines(reused, "es")).toEqual([
      "Reutilizadas (ya pasaron con este mismo código): core.",
    ]);
  });
});

describe("the note when every unit already passed on this code", () => {
  it("AC5: says that none runs again, in Spanish and in English", () => {
    expect(unitsReusedNote(["core", "cli"], "es")).toEqual({
      title: "Verificación completa",
      text: "Todas las unidades ya pasaron con este mismo código, en este cambio o en otro del clon: core, cli. No se repite ninguna.",
    });
    expect(unitsReusedNote(["core", "cli"], "en")).toEqual({
      title: "Full verification",
      text: "Every unit already passed on this same code, in this change or another of the clone: core, cli. None runs again.",
    });
  });
});

describe("the line of a full verification that its time limit cut", () => {
  it("AC4: says the time ran out, at how many seconds, and that less load may be enough, in Spanish and in English", () => {
    expect(timedOutLine(2000, "es")).toBe(
      "Se agotó el tiempo: la verificación se cortó a los 2000 s (`verify.timeoutSec`), antes de terminar. Si la máquina estaba cargada, por ejemplo con otras verificaciones a la vez, reintentar con menos carga puede bastar; si no, la persona puede subir `verify.timeoutSec`.",
    );
    expect(timedOutLine(2000, "en")).toBe(
      "Time ran out: the verification was cut at 2000 s (`verify.timeoutSec`), before it finished. If the machine was busy, for example with other verifications at once, retrying with less load may be enough; otherwise, the person can raise `verify.timeoutSec`.",
    );
  });
});
