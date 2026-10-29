// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type AuditView, auditReport, usageLine } from "../../src";

const USAGE = {
  calls: 2,
  input: 15,
  output: 800,
  cacheWrite: 3000,
  cacheRead: 220_000,
  cost: 0.08406,
};

describe("the consumption in words", () => {
  it("AC3: the closing says its tokens, its calls and its cost, in each language", () => {
    expect(usageLine(USAGE, "es")).toBe(
      "Consumo del cambio, según ccusage: 223,8 mil tokens en 2 llamadas, 0,08 USD.",
    );
    expect(usageLine(USAGE, "en")).toBe(
      "The change's usage, per ccusage: 223.8k tokens in 2 calls, 0.08 USD.",
    );
    // Millions with two decimals, one call, and no cost without prices.
    const big = { calls: 1, input: 1, output: 12_345, cacheWrite: 54_321, cacheRead: 1_179_999 };
    expect(usageLine(big, "es")).toBe(
      "Consumo del cambio, según ccusage: 1,25 M tokens en 1 llamada.",
    );
    expect(usageLine(big, "en")).toBe("The change's usage, per ccusage: 1.25M tokens in 1 call.");
    const small = { calls: 3, input: 10, output: 20, cacheWrite: 30, cacheRead: 40 };
    expect(usageLine(small, "es")).toBe(
      "Consumo del cambio, según ccusage: 100 tokens en 3 llamadas.",
    );
    expect(usageLine(small, "en")).toBe("The change's usage, per ccusage: 100 tokens in 3 calls.");
  });

  it("AC3: `specty audit` shows it on the event's line", () => {
    const view: AuditView = {
      id: "20261029-corregir-boton",
      title: "Corregir botón",
      kind: "quick",
      phase: "done",
      tasks: [],
      events: [
        { ts: "2026-10-29T10:30:00.000Z", actor: "specty", event: "change.usage", data: USAGE },
      ],
    };
    expect(auditReport(view, "es").markdown).toContain(
      "Consumo: 223,8 mil tokens en 2 llamadas, 0,08 USD",
    );
    expect(auditReport(view, "en").markdown).toContain("Usage: 223.8k tokens in 2 calls, 0.08 USD");
  });
});
