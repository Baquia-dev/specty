// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CardContext, doctorCard, renderText } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

describe("doctor, when Antigravity's hooks do not have the configured time", () => {
  it("AC3: names the file, the key and its value, and the command that fixes it, in Spanish and in English", () => {
    const found = {
      ok: [],
      warnings: [],
      problems: [{ code: "antigravity-timeout", file: ".agents/hooks.json", seconds: 60 } as const],
    };
    expect(renderText(doctorCard(found, ES), "es")).toContain(
      "Antigravity: los hooks del guard en .agents/hooks.json no tienen el tiempo de `internal.hooks.antigravityTimeoutSec` (60 s); ejecuta `specty init --tools antigravity`.",
    );
    expect(renderText(doctorCard(found, EN), "en")).toContain(
      "Antigravity: the guard's hooks in .agents/hooks.json do not have the time of `internal.hooks.antigravityTimeoutSec` (60 s); run `specty init --tools antigravity`.",
    );
  });
});
