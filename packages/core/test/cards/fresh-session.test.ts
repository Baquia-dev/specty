// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { freshSessionLine } from "../../src";

describe("the advice of a fresh session", () => {
  it("AC1: says how much context the session carries, in thousands, in each language", () => {
    expect(freshSessionLine(620_002, "es")).toBe(
      "Para el siguiente cambio conviene una sesión nueva del agente (en Claude Code, `/clear`): esta ya lleva unos 620.000 tokens de contexto, y cada paso los vuelve a leer.",
    );
    expect(freshSessionLine(1_234_567, "en")).toBe(
      "For the next change, start a fresh agent session (in Claude Code, `/clear`): this one already carries about 1,235,000 tokens of context, which every step reads again.",
    );
  });
});
