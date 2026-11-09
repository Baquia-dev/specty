// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CardContext, type DoctorLine, doctorCard, doctorLine } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

describe("doctor and an agent this version does not offer", () => {
  it("AC2: warns that its guard is still installed, in Spanish and in English, without turning red", () => {
    const line: DoctorLine = { code: "agent-disabled", tool: "codex", file: ".codex/hooks.json" };
    expect(doctorLine(line, ES)).toBe(
      "Codex: esta versión de Specty aún no lo ofrece, pero su guard sigue en .codex/hooks.json: funciona, aunque `specty doctor` ya no lo comprueba ni `specty init` lo actualiza.",
    );
    expect(doctorLine(line, EN)).toBe(
      "Codex: this version of Specty does not offer it yet, but its guard is still in .codex/hooks.json: it works, though `specty doctor` no longer checks it and `specty init` no longer updates it.",
    );
    expect(doctorCard({ ok: [], warnings: [line], problems: [] }, ES).status).toBe("ok");
  });
});
