// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CardContext, doctorCard, renderText } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

describe("doctor, when Codex's card does not come as a session starts", () => {
  it("AC2: names the file and the command that fixes it, in Spanish and in English", () => {
    const found = {
      ok: [],
      warnings: [],
      problems: [{ code: "codex-startup", file: ".codex/hooks.json" } as const],
    };
    expect(renderText(doctorCard(found, ES), "es")).toContain(
      "Codex: la tarjeta de Specty no llega al empezar una sesión (el SessionStart de .codex/hooks.json no admite startup); ejecuta `specty init --tools codex`.",
    );
    expect(renderText(doctorCard(found, EN), "en")).toContain(
      "Codex: Specty's card does not come as a session starts (the SessionStart in .codex/hooks.json does not take startup); run `specty init --tools codex`.",
    );
  });
});
