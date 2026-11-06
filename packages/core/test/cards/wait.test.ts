// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CardContext, renderText, waitTimeoutCard } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

describe("wait timeout card", () => {
  it("AC4: formats timeout message in both languages without blocking the state", () => {
    const card = waitTimeoutCard("20261031-saludo", 30, ES);
    expect(card.status).toBe("blocked");
    expect(renderText(card, "es")).toContain("Tiempo de espera agotado");
    expect(renderText(card, "es")).toContain("30s");
    const english = waitTimeoutCard("20261031-saludo", 30, EN);
    expect(renderText(english, "en")).toContain("Wait timed out");
  });

  it("AC2, AC4: asks to remind the person and run `specty wait` again right away, in each tool's way", () => {
    const claude = waitTimeoutCard("20261031-saludo", 3600, { ...ES, tool: "claude-code" });
    expect(claude.next).toBe(
      "recuérdale a la persona la decisión pendiente y vuelve a ejecutar ya `specty wait` para esperar su decisión. Ejecútalo en segundo plano (`run_in_background: true`), que te avisa al terminar, y vuelve a ejecutarlo cada vez que se agote o se corte.",
    );
    expect(renderText(claude, "es")).not.toContain("cuando corresponda");
    expect(waitTimeoutCard("20261031-saludo", 3600, { ...EN, tool: "codex" }).next).toBe(
      "remind the person of the pending decision and run `specty wait` again right away to wait for their decision. If it is still running, poll its output until it ends, and run it again each time it times out or is cut off.",
    );
    expect(waitTimeoutCard("20261031-saludo", 3600, EN).next).toBe(
      "remind the person of the pending decision and run `specty wait` again right away to wait for their decision. Run it in the foreground and run it again each time it times out or is cut off.",
    );
    expect(waitTimeoutCard("20261031-saludo", 3600, { ...ES, tool: "gemini-cli" }).next).toBe(
      "recuérdale a la persona la decisión pendiente y vuelve a ejecutar ya `specty wait` para esperar su decisión. Ejecútalo en primer plano y vuelve a ejecutarlo cada vez que se agote o se corte.",
    );
  });
});
