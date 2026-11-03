// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CheckReport, checkDebt, checkDebtLines, type MemoryEntry } from "../../src";

/** One check of each status: failed, warned, passed and not run. */
const REPORT: CheckReport = {
  mode: "all",
  results: [
    { id: "max-lines", level: "error", findings: [{ path: "src/a.ts", message: "520 líneas" }] },
    { id: "todo", level: "warn", findings: [{ path: "src/b.ts", line: 3, message: "TODO" }] },
    { id: "layers", level: "error", findings: [] },
    { id: "secrets", level: "error", findings: [], skipped: "sin gitleaks" },
  ],
};

const debt = (id: string) =>
  `Deuda de \`specty check --all\`: la verificación \`${id}\` tiene hallazgos en el repositorio. Para verlos, \`specty check --all --verbose\`; Specty marca esta entrada hecha cuando la verificación pasa.`;
const debtEn = (id: string) =>
  `\`specty check --all\` debt: the \`${id}\` check has findings in the repository. To see them, \`specty check --all --verbose\`; Specty marks this entry done when the check passes.`;

/** An open improvement. */
const entry = (id: string, text: string, extra: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id,
  kind: "improvement",
  status: "open",
  created: "2026-11-01T10:00:00.000Z",
  origin: { by: "claude-code" },
  text,
  ...extra,
});

describe("the debt of specty check --all in the memory", () => {
  it("AC1: is one entry for each check that fails or warns, in the report's order", () => {
    expect(checkDebt(REPORT, [], "es")).toEqual({
      add: [debt("max-lines"), debt("todo")],
      done: [],
    });
    expect(checkDebt(REPORT, [], "en")).toEqual({
      add: [debtEn("max-lines"), debtEn("todo")],
      done: [],
    });
  });

  it("AC1: names the entries it added", () => {
    expect(checkDebtLines(["P4", "P5"], [], "es")).toEqual([
      "Deuda anotada en la memoria como mejoras: P4, P5.",
    ]);
    expect(checkDebtLines(["P4"], [], "en")).toEqual([
      "Debt added to the memory as improvements: P4.",
    ]);
    expect(checkDebtLines([], [], "es")).toEqual([]);
  });

  it("AC2: does not repeat a debt in the memory and not done, in either language", () => {
    const entries = [
      entry("P1", debt("max-lines"), { status: "dropped" }),
      entry("P2", debtEn("todo"), { status: "taken", taken: { change: "x", at: "y" } }),
    ];
    expect(checkDebt(REPORT, entries, "es").add).toEqual([]);
    const proposed = [entry("P3", debt("todo"), { status: "drop-proposed" })];
    expect(checkDebt(REPORT, proposed, "en").add).toEqual([debtEn("max-lines")]);
  });

  it("AC2: adds again a debt whose entry is done, because it came back", () => {
    const entries = [entry("P1", debt("max-lines"), { status: "done" })];
    expect(checkDebt(REPORT, entries, "es").add).toEqual([debt("max-lines"), debt("todo")]);
  });

  it("AC3: marks done the open entry of the debt of a check that passes, in either language", () => {
    const open = entry("P1", debt("layers"));
    const english = entry("P2", debtEn("layers"));
    const entries = [
      open,
      english,
      entry("P3", debt("layers"), { status: "taken", taken: { change: "x", at: "y" } }),
      entry("P4", debt("layers"), { status: "drop-proposed" }),
      entry("P5", debt("secrets")),
      entry("P6", debt("layers"), { kind: "pending" }),
    ];
    expect(checkDebt(REPORT, entries, "es").done).toEqual([open, english]);
  });

  it("AC3: names the entries it marked done", () => {
    expect(checkDebtLines([], ["P3"], "es")).toEqual([
      "Deuda saldada, marcada hecha en la memoria: P3.",
    ]);
    expect(checkDebtLines(["P4"], ["P1", "P2"], "en")).toEqual([
      "Debt added to the memory as improvements: P4.",
      "Debt paid, marked done in the memory: P1, P2.",
    ]);
  });
});
