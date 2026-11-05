// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CardContext, doctorCard, renderText } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

describe("doctor, when Antigravity's hook does not see the tools of its CLI", () => {
  it("AC4: names the file and the command that fixes it, in Spanish and in English", () => {
    const found = {
      ok: [],
      warnings: [],
      problems: [{ code: "antigravity-cli", file: ".agents/hooks.json" } as const],
    };
    expect(renderText(doctorCard(found, ES), "es")).toContain(
      "Antigravity: .agents/hooks.json es de antes de las herramientas de su CLI (`agy`), así que el guard no ve lo que lee, escribe y edita allí; ejecuta `specty init --tools antigravity`.",
    );
    expect(renderText(doctorCard(found, EN), "en")).toContain(
      "Antigravity: .agents/hooks.json predates the tools of its CLI (`agy`), so the guard does not see what it reads, writes and edits there; run `specty init --tools antigravity`.",
    );
  });
});
