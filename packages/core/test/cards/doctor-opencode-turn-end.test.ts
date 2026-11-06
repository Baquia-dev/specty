// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CardContext, doctorCard, renderText } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

describe("doctor, when OpenCode's plugin does not listen to OpenCode 2.2's end of turn", () => {
  it("AC2: says its end of turn never fires with OpenCode 2.2 and the command that fixes it, in Spanish and in English", () => {
    const found = { ok: [], warnings: [], problems: [{ code: "opencode-turn-end" } as const] };
    expect(renderText(doctorCard(found, ES), "es")).toContain(
      "OpenCode: el plugin del guard es de antes del fin de turno de OpenCode 2.2 (`session.execution.succeeded`), así que con OpenCode 2.2 su fin de turno no se dispara nunca; ejecuta `specty init --tools opencode`.",
    );
    expect(renderText(doctorCard(found, EN), "en")).toContain(
      "OpenCode: the guard plugin predates OpenCode 2.2's end of turn (`session.execution.succeeded`), so with OpenCode 2.2 its end of turn never fires; run `specty init --tools opencode`.",
    );
  });
});
