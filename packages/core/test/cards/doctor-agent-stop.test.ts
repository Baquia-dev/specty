// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CardContext, doctorCard, renderText } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

describe("doctor, when an agent's end of turn is missing", () => {
  it("AC4: says so with the agent's name and the command that fixes it, in Spanish and in English", () => {
    const found = {
      ok: [],
      warnings: [],
      problems: [{ code: "agent-stop", tool: "windsurf" } as const],
    };
    expect(renderText(doctorCard(found, ES), "es")).toContain(
      "Devin (Windsurf): falta el fin de turno de Specty (`hook agent-stop`), que devuelve al agente a `specty wait` cuando el cambio espera a la persona; ejecuta `specty init`.",
    );
    expect(renderText(doctorCard(found, EN), "en")).toContain(
      "Devin (Windsurf): Specty's end of turn (`hook agent-stop`) is missing, which sends the agent back to `specty wait` when the change waits for the person; run `specty init`.",
    );
  });
});
