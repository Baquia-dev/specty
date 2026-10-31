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
});
